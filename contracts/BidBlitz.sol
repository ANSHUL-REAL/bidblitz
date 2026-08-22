// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BidBlitz — hosted live auctions where every bid is a Monad transaction.
 *
 * Anyone can host a room. The host wallet IS the credential: only the address
 * that created a room can start or sell its lots, so there is no shared admin
 * secret and no server-side organizer key anywhere in the system.
 *
 * Storage is packed for Monad gas specifically: a cold SLOAD costs 8,100 here
 * versus 2,100 on Ethereum, so the hot path (placeBid) touches exactly two
 * slots — the packed Lot, and leadBidder.
 *
 * Purses are accounting, not custody. sellLot decrements a counter; no MON ever
 * moves on settlement. Nothing can go insolvent and there is no reentrancy
 * surface.
 */
contract BidBlitz {
    // --- errors (cheaper and smaller than require strings) ---
    error NoRoom();
    error NotHost();
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

    uint16 public constant SQUAD_COUNT = 4;

    /// Purses are accounting units, not custody — no MON moves on settlement —
    /// so they are denominated to read well on screen (bids land around
    /// "12.34 MON", not "0.001"). Only gas is ever real MON.
    uint128 public constant SQUAD_START = 200 ether;
    uint128 public constant SOLO_START = 50 ether;

    /// Real MON sent to contribute() is scaled into that same accounting space,
    /// so a tiny top-up still visibly moves the purse on screen.
    uint256 public constant CONTRIBUTION_MULTIPLIER = 1000;

    uint40 public constant ANTISNIPE = 3;
    uint40 public constant MAX_DURATION = 300;

    struct Room {
        address host;
        uint40  createdAt;
        uint16  entityCount;
        uint32  lotCount;
        uint32  openLot;
        bool    exists;
    }

    /// purse = remaining spendable. spent = cumulative, for closing stats.
    struct Entity { uint128 purse; uint128 spent; }

    /// ONE slot, 160 bits. Everything placeBid needs to validate AND update.
    struct Lot {
        uint96 highestBid;
        uint40 endsAt;
        uint16 leadEntity;
        bool   sold;
    }

    uint32 public roomCount;
    mapping(uint32 => Room)   public rooms;
    mapping(uint32 => string) public roomName;

    mapping(uint32 => mapping(uint16 => Entity))  public entities;
    mapping(uint32 => mapping(address => uint16)) public entityOf;

    mapping(uint32 => mapping(uint32 => Lot))     public lots;
    mapping(uint32 => mapping(uint32 => address)) public leadBidder;

    /// Typed live by the host. NEVER read by placeBid, so live lots cost nothing
    /// on the hot path.
    mapping(uint32 => mapping(uint32 => string)) public lotName;
    mapping(uint32 => mapping(uint32 => string)) public lotImage;

    string public badgeImage;

    // --- soulbound winner badge (minimal ERC-721) ---
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string)  private _badgeName;

    event RoomCreated(uint32 indexed roomId, address indexed host, string name);
    event Joined(uint32 indexed roomId, address indexed who, uint16 indexed entityId, bool solo);
    event Contributed(uint32 indexed roomId, address indexed who, uint16 indexed entityId, uint256 amount, uint128 purse);
    event LotStarted(uint32 indexed roomId, uint32 indexed lotId, string name, string image, uint40 endsAt);
    event BidPlaced(uint32 indexed roomId, uint32 indexed lotId, address indexed bidder, uint16 entityId, uint96 amount, uint40 endsAt);
    event LotSold(uint32 indexed roomId, uint32 indexed lotId, address indexed winner, uint16 entityId, uint96 amount, string name);
    event LotUnsold(uint32 indexed roomId, uint32 indexed lotId, string name);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    modifier onlyHost(uint32 roomId) {
        Room storage r = rooms[roomId];
        if (!r.exists) revert NoRoom();
        if (msg.sender != r.host) revert NotHost();
        _;
    }

    // ------------------------------------------------------------------ rooms

    /// Anyone can host. The creating wallet becomes the only controller.
    function createRoom(string calldata rname) external returns (uint32 roomId) {
        roomId = ++roomCount;
        rooms[roomId] = Room({
            host: msg.sender,
            createdAt: uint40(block.timestamp),
            entityCount: SQUAD_COUNT,
            lotCount: 0,
            openLot: 0,
            exists: true
        });
        roomName[roomId] = rname;

        for (uint16 i = 1; i <= SQUAD_COUNT; ++i) {
            entities[roomId][i] = Entity({ purse: SQUAD_START, spent: 0 });
        }

        emit RoomCreated(roomId, msg.sender, rname);
    }

    // ---------------------------------------------------------------- joining

    /// Squads are entities 1..SQUAD_COUNT, preallocated when the room is made.
    function joinSquad(uint32 roomId, uint16 squadId) external {
        if (!rooms[roomId].exists) revert NoRoom();
        if (entityOf[roomId][msg.sender] != 0) revert AlreadyJoined();
        if (squadId == 0 || squadId > SQUAD_COUNT) revert BadEntity();
        entityOf[roomId][msg.sender] = squadId;
        emit Joined(roomId, msg.sender, squadId, false);
    }

    /// Solo is a team of one — same contract, same functions, no fork.
    function joinSolo(uint32 roomId) external returns (uint16 id) {
        Room storage r = rooms[roomId];
        if (!r.exists) revert NoRoom();
        if (entityOf[roomId][msg.sender] != 0) revert AlreadyJoined();
        id = ++r.entityCount;
        entities[roomId][id] = Entity({ purse: SOLO_START, spent: 0 });
        entityOf[roomId][msg.sender] = id;
        emit Joined(roomId, msg.sender, id, true);
    }

    /// Optional top-up. Contributing to a rival is allowed — it is a party game.
    function contribute(uint32 roomId, uint16 entityId) external payable {
        Room storage r = rooms[roomId];
        if (!r.exists) revert NoRoom();
        if (entityId == 0 || entityId > r.entityCount) revert BadEntity();
        if (msg.value == 0 || msg.value > 1_000 ether) revert BadAmount();
        Entity storage e = entities[roomId][entityId];
        e.purse += uint128(msg.value * CONTRIBUTION_MULTIPLIER);
        emit Contributed(roomId, msg.sender, entityId, msg.value, e.purse);
    }

    // --------------------------------------------------------------- auction

    /// Creates AND opens a lot in one transaction, so it is one tap on stage.
    function startLot(uint32 roomId, string calldata lname, string calldata limage, uint40 dur)
        external
        onlyHost(roomId)
        returns (uint32 id)
    {
        Room storage r = rooms[roomId];
        if (r.openLot != 0) revert LotAlreadyOpen();
        if (dur == 0 || dur > MAX_DURATION) revert BadDuration();

        id = ++r.lotCount;
        lotName[roomId][id] = lname;
        lotImage[roomId][id] = limage;

        uint40 endsAt = uint40(block.timestamp) + dur;
        lots[roomId][id] = Lot({ highestBid: 0, endsAt: endsAt, leadEntity: 0, sold: false });
        r.openLot = id;

        emit LotStarted(roomId, id, lname, limage, endsAt);
    }

    /**
     * `amount` is declared uint96, never cast from uint256 — the ABI decoder
     * rejects out-of-range external inputs for free. A cast here would let
     * someone send 2^96+5: the purse check passes on the big number while the
     * stored bid silently becomes 5.
     *
     * Moves no funds. Only records who is winning.
     */
    function placeBid(uint32 roomId, uint32 lotId, uint96 amount) external {
        uint16 e = entityOf[roomId][msg.sender];
        if (e == 0) revert NotJoined();
        if (lotId == 0 || lotId != rooms[roomId].openLot) revert WrongLot();

        Lot memory l = lots[roomId][lotId];              // one SLOAD, packed slot
        if (l.sold) revert WrongLot();
        if (block.timestamp >= l.endsAt) revert AuctionEnded();
        if (amount <= l.highestBid) revert BidTooLow(l.highestBid); // strict: block order breaks ties

        uint128 purse = entities[roomId][e].purse;
        if (uint128(amount) > purse) revert ExceedsPurse(purse);

        // Anti-snipe. Costs zero extra gas — that slot is being written anyway.
        uint40 endsAt = l.endsAt;
        unchecked {
            if (endsAt - uint40(block.timestamp) <= ANTISNIPE) {
                endsAt = uint40(block.timestamp) + ANTISNIPE;
            }
        }

        lots[roomId][lotId] = Lot({ highestBid: amount, endsAt: endsAt, leadEntity: e, sold: false });
        leadBidder[roomId][lotId] = msg.sender;

        emit BidPlaced(roomId, lotId, msg.sender, e, amount, endsAt);
    }

    /**
     * MUST NEVER REVERT (past access control). This is pressed on stage in front
     * of a room; it always has to advance the auction. Every failure mode below
     * returns instead of reverting, and the purse debit is clamped rather than
     * allowed to underflow.
     */
    function sellLot(uint32 roomId, uint32 lotId) external onlyHost(roomId) {
        Room storage r = rooms[roomId];
        if (lotId == 0 || lotId > r.lotCount) return;

        if (lots[roomId][lotId].sold) {
            if (r.openLot == lotId) r.openLot = 0;
            return;
        }

        lots[roomId][lotId].sold = true;
        if (r.openLot == lotId) r.openLot = 0;

        _settle(roomId, lotId);
    }

    /// Split out of sellLot purely to keep the stack shallow enough for the
    /// non-viaIR pipeline. Same never-revert contract as its caller.
    function _settle(uint32 roomId, uint32 lotId) private {
        address winner = leadBidder[roomId][lotId];
        Lot memory l = lots[roomId][lotId];
        string memory label = lotName[roomId][lotId];

        if (winner == address(0) || l.leadEntity == 0) {
            emit LotUnsold(roomId, lotId, label);
            return;
        }

        Entity storage ent = entities[roomId][l.leadEntity];
        uint128 amt = uint128(l.highestBid);
        if (amt > ent.purse) amt = ent.purse;   // clamp, never underflow
        unchecked {
            ent.purse -= amt;
            ent.spent += amt;
        }

        _mint(winner, badgeId(roomId, lotId), label);
        emit LotSold(roomId, lotId, winner, l.leadEntity, l.highestBid, label);
    }

    /// Escape hatch if a lot needs abandoning without a sale.
    function closeLot(uint32 roomId) external onlyHost(roomId) {
        rooms[roomId].openLot = 0;
    }

    // ------------------------------------------------------------------ views

    struct Snapshot {
        bool    exists;
        address host;
        string  rname;
        uint32  lotId;
        uint32  openLotId;
        uint32  totalLots;
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

    /// Everything a room needs, in ONE eth_call — so chain read rate is
    /// independent of how many people are in it. chainNow anchors the countdown
    /// to chain time rather than a skewed laptop clock.
    function state(uint32 roomId) external view returns (Snapshot memory s) {
        Room memory r = rooms[roomId];
        s.exists = r.exists;
        s.host = r.host;
        s.rname = roomName[roomId];
        s.openLotId = r.openLot;
        s.totalLots = r.lotCount;
        s.chainNow = block.timestamp;
        s.blockNumber = block.number;
        s.nEntities = r.entityCount;

        // Falls back to the most recent lot so the SOLD reveal stays on screen
        // after the lot closes, instead of blanking.
        s.lotId = r.openLot != 0 ? r.openLot : r.lotCount;
        if (s.lotId != 0) {
            Lot memory l = lots[roomId][s.lotId];
            s.highestBid = l.highestBid;
            s.endsAt = l.endsAt;
            s.leadEntity = l.leadEntity;
            s.sold = l.sold;
            s.bidder = leadBidder[roomId][s.lotId];
            s.lname = lotName[roomId][s.lotId];
            s.limage = lotImage[roomId][s.lotId];
        }

        s.squadPurses = new uint128[](SQUAD_COUNT);
        for (uint16 i = 0; i < SQUAD_COUNT; ++i) {
            s.squadPurses[i] = entities[roomId][i + 1].purse;
        }
    }

    function purseOf(uint32 roomId, address who)
        external
        view
        returns (uint16 id, uint128 purse, uint128 spent)
    {
        id = entityOf[roomId][who];
        Entity memory e = entities[roomId][id];
        return (id, e.purse, e.spent);
    }

    struct RoomCard {
        uint32  roomId;
        address host;
        string  rname;
        uint32  lotCount;
        uint32  openLot;
        uint16  entityCount;
        uint40  createdAt;
    }

    /// Newest-first listing for the lobby.
    function recentRooms(uint32 limit) external view returns (RoomCard[] memory out) {
        uint32 n = roomCount < limit ? roomCount : limit;
        out = new RoomCard[](n);
        for (uint32 i = 0; i < n; ++i) {
            uint32 id = roomCount - i;
            Room memory r = rooms[id];
            out[i] = RoomCard({
                roomId: id,
                host: r.host,
                rname: roomName[id],
                lotCount: r.lotCount,
                openLot: r.openLot,
                entityCount: r.entityCount,
                createdAt: r.createdAt
            });
        }
    }

    // ------------------------------------------------- soulbound ERC-721 badge

    /// Unique across rooms, and decodable back to (room, lot) off-chain.
    function badgeId(uint32 roomId, uint32 lotId) public pure returns (uint256) {
        return (uint256(roomId) << 32) | uint256(lotId);
    }

    function name() external pure returns (string memory) { return "BidBlitz Winner Badge"; }
    function symbol() external pure returns (string memory) { return "BLITZ"; }
    function ownerOf(uint256 id) external view returns (address) { return _owners[id]; }
    function balanceOf(address o) external view returns (uint256) { return _balances[o]; }

    /// Cosmetic metadata only; first caller wins.
    function setBadgeImage(string calldata url) external {
        if (bytes(badgeImage).length == 0) badgeImage = url;
    }

    /// Plain JSON data URI pointing at a static image. Building base64 SVG
    /// on-chain is 1-2KB of bytecode for something nobody imports mid-demo.
    /// Lot names are sanitised in the UI — a raw quote would break this JSON.
    function tokenURI(uint256 id) external view returns (string memory) {
        return string(
            abi.encodePacked(
                'data:application/json;utf8,{"name":"',
                _badgeName[id],
                '","description":"Won at BidBlitz.","image":"',
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
    function _mint(address to, uint256 tokenId, string memory label) private {
        if (to == address(0) || _owners[tokenId] != address(0)) return;
        _owners[tokenId] = to;
        _badgeName[tokenId] = label;
        unchecked { _balances[to] += 1; }
        emit Transfer(address(0), to, tokenId);
    }
}
