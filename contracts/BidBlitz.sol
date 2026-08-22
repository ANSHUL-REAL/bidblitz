// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BidBlitz — a live IPL-style auction where every bid is a Monad transaction.
 *
 * Storage is packed for Monad's gas model specifically: a cold SLOAD costs
 * 8,100 here versus 2,100 on Ethereum, so the hot path (placeBid) is built to
 * touch exactly two slots — the packed Lot, and leadBidder.
 *
 * Purses are accounting, not custody. sellLot decrements a counter; no MON ever
 * moves on settlement. Nothing can go insolvent and there is no reentrancy
 * surface. Real MON sent via contribute() stays in the contract until rescue().
 */
contract BidBlitz {
    // --- errors (cheaper and smaller than require strings) ---
    error NotOrganizer();
    error AlreadyJoined();
    error NotJoined();
    error LotAlreadyOpen();
    error WrongLot();
    error AuctionEnded();
    error BidTooLow(uint96 current);
    error ExceedsPurse(uint128 available);
    error BadDuration();
    error BadEntity();
    error BadAmount();
    error Soulbound();

    address public immutable organizer;

    uint16  public constant SQUAD_COUNT = 4;

    /// Purses are accounting units, not custody — no MON moves on settlement —
    /// so they are denominated to read well on the big screen (bids land around
    /// "12.34 MON" like the design, not "0.001"). Only gas is ever real MON.
    uint128 public constant SQUAD_START = 200 ether;
    uint128 public constant SOLO_START  = 50 ether;

    /// Real MON sent to contribute() is scaled into that same accounting space,
    /// so a tiny 0.01 MON top-up visibly moves the purse on screen.
    uint256 public constant CONTRIBUTION_MULTIPLIER = 1000;

    uint40  public constant ANTISNIPE   = 3;
    uint40  public constant MAX_DURATION = 300;

    /// purse = remaining spendable. spent = cumulative, for the closing stats.
    struct Entity { uint128 purse; uint128 spent; }
    mapping(uint16 => Entity)  public entities;
    mapping(address => uint16) public entityOf;
    uint16 public entityCount;

    /// ONE slot, 160 bits. Everything placeBid needs to validate AND update.
    struct Lot {
        uint96 highestBid;
        uint40 endsAt;
        uint16 leadEntity;
        bool   sold;
    }
    mapping(uint256 => Lot)     public lots;
    mapping(uint256 => address) public leadBidder;   // written per bid, read on settle

    /// Typed live by the organizer. NEVER read by placeBid, so live lots cost
    /// nothing on the hot path.
    mapping(uint256 => string) public lotName;
    mapping(uint256 => string) public lotImage;

    uint256 public lotCount;   // lots are 1-indexed
    uint256 public openLot;    // 0 = none. Single-open-lot invariant.

    string public badgeImage;

    // --- soulbound winner badge (minimal ERC-721) ---
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;

    event Joined(address indexed who, uint16 indexed entityId, bool solo);
    event Contributed(address indexed who, uint16 indexed entityId, uint256 amount, uint128 purse);
    event LotStarted(uint256 indexed lotId, string name, string image, uint40 endsAt);
    event BidPlaced(uint256 indexed lotId, uint16 indexed entityId, address indexed bidder, uint96 amount, uint40 endsAt);
    event LotSold(uint256 indexed lotId, uint16 indexed entityId, address indexed winner, uint96 amount, string name);
    event LotUnsold(uint256 indexed lotId, string name);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    modifier onlyOrganizer() {
        if (msg.sender != organizer) revert NotOrganizer();
        _;
    }

    constructor() {
        organizer = msg.sender;
        for (uint16 i = 1; i <= SQUAD_COUNT; ++i) {
            entities[i] = Entity({ purse: SQUAD_START, spent: 0 });
        }
        entityCount = SQUAD_COUNT;
    }

    // ---------------------------------------------------------------- joining

    /// Squads are entities 1..SQUAD_COUNT, preallocated in the constructor.
    function joinSquad(uint16 squadId) external {
        if (entityOf[msg.sender] != 0) revert AlreadyJoined();
        if (squadId == 0 || squadId > SQUAD_COUNT) revert BadEntity();
        entityOf[msg.sender] = squadId;
        emit Joined(msg.sender, squadId, false);
    }

    /// Solo is a team of one — same contract, same functions, no fork.
    function joinSolo() external returns (uint16 id) {
        if (entityOf[msg.sender] != 0) revert AlreadyJoined();
        id = ++entityCount;
        entities[id] = Entity({ purse: SOLO_START, spent: 0 });
        entityOf[msg.sender] = id;
        emit Joined(msg.sender, id, true);
    }

    /// Optional top-up. Contributing to a rival is allowed — it is a party game.
    function contribute(uint16 entityId) external payable {
        if (entityId == 0 || entityId > entityCount) revert BadEntity();
        if (msg.value == 0 || msg.value > 1_000 ether) revert BadAmount();
        Entity storage e = entities[entityId];
        e.purse += uint128(msg.value * CONTRIBUTION_MULTIPLIER);
        emit Contributed(msg.sender, entityId, msg.value, e.purse);
    }

    // --------------------------------------------------------------- auction

    /// Creates AND opens a lot in one transaction, so it is one tap on stage.
    function startLot(string calldata lname, string calldata limage, uint40 dur)
        external
        onlyOrganizer
        returns (uint256 id)
    {
        if (openLot != 0) revert LotAlreadyOpen();
        if (dur == 0 || dur > MAX_DURATION) revert BadDuration();

        id = ++lotCount;
        lotName[id] = lname;
        lotImage[id] = limage;

        uint40 endsAt = uint40(block.timestamp) + dur;
        lots[id] = Lot({ highestBid: 0, endsAt: endsAt, leadEntity: 0, sold: false });
        openLot = id;

        emit LotStarted(id, lname, limage, endsAt);
    }

    /**
     * `amount` is declared uint96, never cast from uint256 — Solidity's ABI
     * decoder rejects out-of-range external inputs for free. A cast here would
     * let someone send 2^96+5: the purse check passes on the big number while
     * the stored bid silently becomes 5.
     *
     * Moves no funds. Only records who is winning.
     */
    function placeBid(uint256 lotId, uint96 amount) external {
        uint16 e = entityOf[msg.sender];
        if (e == 0) revert NotJoined();
        if (lotId == 0 || lotId != openLot) revert WrongLot();

        Lot memory l = lots[lotId];                       // one SLOAD, packed slot
        if (l.sold) revert WrongLot();
        if (block.timestamp >= l.endsAt) revert AuctionEnded();
        if (amount <= l.highestBid) revert BidTooLow(l.highestBid);  // strict: block order breaks ties

        uint128 purse = entities[e].purse;
        if (uint128(amount) > purse) revert ExceedsPurse(purse);

        // Anti-snipe. Costs zero extra gas — that slot is being written anyway.
        uint40 endsAt = l.endsAt;
        unchecked {
            if (endsAt - uint40(block.timestamp) <= ANTISNIPE) {
                endsAt = uint40(block.timestamp) + ANTISNIPE;
            }
        }

        lots[lotId] = Lot({ highestBid: amount, endsAt: endsAt, leadEntity: e, sold: false });
        leadBidder[lotId] = msg.sender;

        emit BidPlaced(lotId, e, msg.sender, amount, endsAt);
    }

    /**
     * MUST NEVER REVERT (past access control). This is pressed on stage in front
     * of 70 people; it always has to advance the auction. Every failure mode
     * below returns instead of reverting, and the purse debit is clamped rather
     * than allowed to underflow.
     */
    function sellLot(uint256 lotId) external onlyOrganizer {
        if (lotId == 0 || lotId > lotCount) return;

        Lot memory l = lots[lotId];
        if (l.sold) {
            if (openLot == lotId) openLot = 0;
            return;
        }

        lots[lotId].sold = true;
        if (openLot == lotId) openLot = 0;

        address winner = leadBidder[lotId];
        if (winner == address(0) || l.leadEntity == 0) {
            emit LotUnsold(lotId, lotName[lotId]);
            return;
        }

        Entity storage ent = entities[l.leadEntity];
        uint128 amt = uint128(l.highestBid);
        if (amt > ent.purse) amt = ent.purse;      // clamp, never underflow
        unchecked {
            ent.purse -= amt;
            ent.spent += amt;
        }

        _mint(winner, lotId);
        emit LotSold(lotId, l.leadEntity, winner, l.highestBid, lotName[lotId]);
    }

    /// Escape hatch if a lot needs to be abandoned without selling.
    function closeLot() external onlyOrganizer {
        openLot = 0;
    }

    function setBadgeImage(string calldata url) external onlyOrganizer {
        badgeImage = url;
    }

    /// Recovers real MON contributed during the event. Purses are accounting
    /// only, so this cannot take anything the auction depends on.
    function rescue() external onlyOrganizer {
        (bool ok, ) = payable(organizer).call{ value: address(this).balance }("");
        require(ok, "rescue failed");
    }

    // ------------------------------------------------------------------ views

    struct Snapshot {
        uint256 lotId;
        uint256 openLotId;
        uint256 totalLots;
        uint96  highestBid;
        uint40  endsAt;
        uint16  leadEntity;
        bool    sold;
        address bidder;
        string  lname;
        string  limage;
        uint256 chainNow;
        uint256 blockNumber;
        uint16  nEntities;
        uint128[] squadPurses;
    }

    /// Everything the big screen and phones need, in ONE eth_call — so the chain
    /// read rate is independent of how many people are in the room.
    /// chainNow anchors the countdown to chain time, not a skewed laptop clock.
    function state() external view returns (Snapshot memory s) {
        s.openLotId = openLot;
        s.totalLots = lotCount;
        s.chainNow = block.timestamp;
        s.blockNumber = block.number;
        s.nEntities = entityCount;

        // Falls back to the most recent lot so the SOLD reveal stays on screen
        // after the lot closes, instead of blanking.
        s.lotId = openLot != 0 ? openLot : lotCount;
        if (s.lotId != 0) {
            Lot memory l = lots[s.lotId];
            s.highestBid = l.highestBid;
            s.endsAt = l.endsAt;
            s.leadEntity = l.leadEntity;
            s.sold = l.sold;
            s.bidder = leadBidder[s.lotId];
            s.lname = lotName[s.lotId];
            s.limage = lotImage[s.lotId];
        }

        s.squadPurses = new uint128[](SQUAD_COUNT);
        for (uint16 i = 0; i < SQUAD_COUNT; ++i) {
            s.squadPurses[i] = entities[i + 1].purse;
        }
    }

    function purseOf(address who) external view returns (uint16 id, uint128 purse, uint128 spent) {
        id = entityOf[who];
        Entity memory e = entities[id];
        return (id, e.purse, e.spent);
    }

    function lotInfo(uint256 id)
        external
        view
        returns (string memory lname, string memory limage, Lot memory l, address bidder)
    {
        return (lotName[id], lotImage[id], lots[id], leadBidder[id]);
    }

    // ------------------------------------------------- soulbound ERC-721 badge

    function name() external pure returns (string memory) { return "BidBlitz Winner Badge"; }
    function symbol() external pure returns (string memory) { return "BLITZ"; }
    function ownerOf(uint256 id) external view returns (address) { return _owners[id]; }
    function balanceOf(address o) external view returns (uint256) { return _balances[o]; }

    /// Plain JSON data URI pointing at a static PNG. Building base64 SVG on-chain
    /// is 1-2KB of bytecode for something nobody imports during a live demo.
    /// NOTE: lot names are sanitised in the admin UI — a raw `"` would break this JSON.
    function tokenURI(uint256 id) external view returns (string memory) {
        return string(
            abi.encodePacked(
                'data:application/json;utf8,{"name":"',
                lotName[id],
                '","description":"Won at BidBlitz - Monad Blitz Hyderabad.","image":"',
                badgeImage,
                '"}'
            )
        );
    }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0x01ffc9a7 || iid == 0x80ac58cd || iid == 0x5b5e139f;
    }

    /// Soulbound: the badge is non-transferable proof you won the lot.
    function transferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function approve(address, uint256) external pure { revert Soulbound(); }
    function setApprovalForAll(address, bool) external pure { revert Soulbound(); }

    /// Never reverts — sellLot depends on that.
    function _mint(address to, uint256 tokenId) private {
        if (to == address(0) || _owners[tokenId] != address(0)) return;
        _owners[tokenId] = to;
        unchecked { _balances[to] += 1; }
        emit Transfer(address(0), to, tokenId);
    }
}
