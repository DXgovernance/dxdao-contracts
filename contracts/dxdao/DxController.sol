pragma solidity ^0.5.4;

import "../daostack/controller/Avatar.sol";
import "../daostack/controller/ControllerInterface.sol";

/**
 * @title Controller contract
 * @dev A controller controls the organizations tokens, reputation and avatar.
 * It is subject to a set of schemes and constraints that determine its behavior.
 * Each scheme has it own parameters and operation permissions.
 */
contract DxController {
    struct Scheme {
        bytes32 paramsHash; // a hash "configuration" of the scheme
        bytes4 permissions; // A bitwise flags of permissions,
        // All 0: Not registered,
        // 1st bit: Flag if the scheme is registered,
        // 2nd bit: Scheme can register other schemes
        // 3rd bit: Scheme can add/remove global constraints
        // 4th bit: Scheme can upgrade the controller
        // 5th bit: Scheme can call genericCall on behalf of
        //          the organization avatar
        bool isRegistered;
        bool canManageSchemes;
        bool canMakeAvatarCalls;
    }

    address[] schemesAddresses;

    mapping(address => Scheme) public schemes;

    Avatar public avatar;
    DAOToken public nativeToken;
    Reputation public nativeReputation;
    // newController will point to the new controller after the present controller is upgraded
    address public newController;
    
    event RegisterScheme(address indexed _sender, address indexed _scheme);
    event UnregisterScheme(address indexed _sender, address indexed _scheme);
    event UpgradeController(address indexed _oldController, address _newController);

    constructor(Avatar _avatar) public {
        avatar = _avatar;
        nativeToken = avatar.nativeToken();
        nativeReputation = avatar.nativeReputation();
        schemes[msg.sender] = Scheme({
            paramsHash: bytes32(0),
            permissions: bytes4(0x0000001F),
            isRegistered: true,
            canManageSchemes: true,
            canMakeAvatarCalls: true
        });
    }

    // Do not allow mistaken calls:
    // solhint-disable-next-line payable-fallback
    function() external {
        revert();
    }

    // Modifiers:
    modifier onlyRegisteredScheme() {
        require(schemes[msg.sender].permissions & bytes4(0x00000001) == bytes4(0x00000001));
        _;
    }

    modifier onlyRegisteringSchemes() {
        require(schemes[msg.sender].permissions & bytes4(0x00000002) == bytes4(0x00000002));
        _;
    }

    modifier onlyGlobalConstraintsScheme() {
        require(schemes[msg.sender].permissions & bytes4(0x00000004) == bytes4(0x00000004));
        _;
    }

    modifier onlyUpgradingScheme() {
        require(schemes[msg.sender].permissions & bytes4(0x00000008) == bytes4(0x00000008));
        _;
    }

    modifier onlyGenericCallScheme() {
        require(schemes[msg.sender].permissions & bytes4(0x00000010) == bytes4(0x00000010));
        _;
    }

    modifier onlyMetaDataScheme() {
        require(schemes[msg.sender].permissions & bytes4(0x00000010) == bytes4(0x00000010));
        _;
    }

    modifier isAvatarValid(address _avatar) {
        require(_avatar == address(avatar));
        _;
    }

    /**
     * @dev register a scheme
     * @param _scheme the address of the scheme
     * @param _paramsHash a hashed configuration of the usage of the scheme
     * @param _permissions the permissions the new scheme will have
     * @return bool which represents a success
     */
    function registerScheme(
        address _scheme,
        bytes32 _paramsHash,
        bytes4 _permissions,
        address _avatar
    ) external onlyRegisteringSchemes isAvatarValid(_avatar) returns (bool) {
        Scheme memory scheme = schemes[_scheme];

        // Check scheme has at least the permissions it is changing, and at least the current permissions:
        // Implementation is a bit messy. One must recall logic-circuits ^^

        // produces non-zero if sender does not have all of the perms that are changing between old and new
        require(
            bytes4(0x0000001f) & (_permissions ^ scheme.permissions) & (~schemes[msg.sender].permissions) == bytes4(0)
        );

        // produces non-zero if sender does not have all of the perms in the old scheme
        require(bytes4(0x0000001f) & (scheme.permissions & (~schemes[msg.sender].permissions)) == bytes4(0));

        // Add or change the scheme:
        schemes[_scheme].paramsHash = _paramsHash;
        schemes[_scheme].permissions = _permissions | bytes4(0x00000001);
        emit RegisterScheme(msg.sender, _scheme);
        return true;
    }

    /**
     * @dev unregister a scheme
     * @param _scheme the address of the scheme
     * @return bool which represents a success
     */
    function unregisterScheme(address _scheme, address _avatar)
        external
        onlyRegisteringSchemes
        isAvatarValid(_avatar)
        returns (bool)
    {
        //check if the scheme is registered
        if (_isSchemeRegistered(_scheme) == false) {
            return false;
        }
        // Check the unregistering scheme has enough permissions:
        require(bytes4(0x0000001f) & (schemes[_scheme].permissions & (~schemes[msg.sender].permissions)) == bytes4(0));

        // Unregister:
        emit UnregisterScheme(msg.sender, _scheme);
        delete schemes[_scheme];
        return true;
    }

    /**
     * @dev unregister the caller's scheme
     * @return bool which represents a success
     */
    function unregisterSelf(address _avatar) external isAvatarValid(_avatar) returns (bool) {
        if (_isSchemeRegistered(msg.sender) == false) {
            return false;
        }
        delete schemes[msg.sender];
        emit UnregisterScheme(msg.sender, msg.sender);
        return true;
    }

    /**
     * @dev upgrade the Controller
     *      The function will trigger an event 'UpgradeController'.
     * @param  _newController the address of the new controller.
     * @return bool which represents a success
     */
    function upgradeController(address _newController, Avatar _avatar)
        external
        onlyUpgradingScheme
        isAvatarValid(address(_avatar))
        returns (bool)
    {
        require(newController == address(0)); // so the upgrade could be done once for a contract.
        require(_newController != address(0));
        newController = _newController;
        avatar.transferOwnership(_newController);
        require(avatar.owner() == _newController);
        if (nativeToken.owner() == address(this)) {
            nativeToken.transferOwnership(_newController);
            require(nativeToken.owner() == _newController);
        }
        if (nativeReputation.owner() == address(this)) {
            nativeReputation.transferOwnership(_newController);
            require(nativeReputation.owner() == _newController);
        }
        emit UpgradeController(address(this), newController);
        return true;
    }

    /**
     * @dev perform a generic call to an arbitrary contract
     * @param _contract  the contract's address to call
     * @param _data ABI-encoded contract call to call `_contract` address.
     * @param _avatar the controller's avatar address
     * @param _value value (ETH) to transfer with the transaction
     * @return bool -success
     *         bytes  - the return value of the called _contract's function.
     */
    function genericCall(
        address _contract,
        bytes calldata _data,
        Avatar _avatar,
        uint256 _value
    )
        external
        onlyGenericCallScheme
        isAvatarValid(address(_avatar))
        returns (bool, bytes memory)
    {
        return avatar.genericCall(_contract, _data, _value);
    }

    function isSchemeRegistered(address _scheme, address _avatar) external view isAvatarValid(_avatar) returns (bool) {
        return _isSchemeRegistered(_scheme);
    }

    function getSchemeParameters(address _scheme, address _avatar)
        external
        view
        isAvatarValid(_avatar)
        returns (bytes32)
    {
        return schemes[_scheme].paramsHash;
    }

    function getSchemePermissions(address _scheme, address _avatar)
        external
        view
        isAvatarValid(_avatar)
        returns (bytes4)
    {
        return schemes[_scheme].permissions;
    }

    function _isSchemeRegistered(address _scheme) private view returns (bool) {
        return (schemes[_scheme].permissions & bytes4(0x00000001) != bytes4(0));
    }
}
