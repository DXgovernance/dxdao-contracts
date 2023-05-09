pragma solidity ^0.8.8;

// Desired Features
// - Add Event
// - Add Event Organizer
// - Mint token for an event
// - Batch Mint
// - Burn Tokens (only admin?)
// - Pause contract (only admin)
// - ERC721 full interface (base, metadata, enumerable)

interface IPoap {
    event EventToken(uint256 eventId, uint256 tokenId);

    /**
     * @dev Gets the token name
     * @return string representing the token name
     */
    function name() external view returns (string memory);

    /**
     * @dev Gets the token symbol
     * @return string representing the token symbol
     */
    function symbol() external view returns (string memory);

    function tokenEvent(uint256 tokenId) external view returns (uint256);

    function ownerOf(uint256 tokenId) external view returns (address);

    function tokenDetailsOfOwnerByIndex(address owner, uint256 index)
        external
        view
        returns (uint256 tokenId, uint256 eventId);

    /**
     * @dev Gets the token uri
     * @return string representing the token uri
     */
    function tokenURI(uint256 tokenId) external view returns (string memory);

    function setBaseURI(string memory baseURI) external;

    function approve(address to, uint256 tokenId) external;

    function setApprovalForAll(address to, bool approved) external;

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    /**
     * @dev Function to mint tokens
     * @param eventId EventId for the new token
     * @param to The address that will receive the minted tokens.
     * @return A boolean that indicates if the operation was successful.
     */
    function mintToken(uint256 eventId, address to) external returns (bool);

    /**
     * @dev Function to mint tokens with a specific id
     * @param eventId EventId for the new token
     * @param tokenId TokenId for the new token
     * @param to The address that will receive the minted tokens.
     * @return A boolean that indicates if the operation was successful.
     */
    function mintToken(
        uint256 eventId,
        uint256 tokenId,
        address to
    ) external returns (bool);

    /**
     * @dev Function to mint tokens
     * @param eventId EventId for the new token
     * @param to The address that will receive the minted tokens.
     * @return A boolean that indicates if the operation was successful.
     */
    function mintEventToManyUsers(uint256 eventId, address[] memory to) external returns (bool);

    /**
     * @dev Function to mint tokens
     * @param eventIds EventIds to assing to user
     * @param to The address that will receive the minted tokens.
     * @return A boolean that indicates if the operation was successful.
     */
    function mintUserToManyEvents(uint256[] memory eventIds, address to) external returns (bool);

    /**
     * @dev Burns a specific ERC721 token.
     * @param tokenId uint256 id of the ERC721 token to be burned.
     */
    function burn(uint256 tokenId) external;

    function initialize(
        string memory __name,
        string memory __symbol,
        string memory __baseURI,
        address[] memory admins
    ) external;

    function removeAdmin(address account) external;
}
