pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "./DxAvatar.sol";

/**
 * @title Controller contract
 * @dev A controller controls the organizations schemes, reputation and avatar.
 * It is subject to a set of schemes and constraints that determine its behavior.
 * Each scheme has it own parameters and operation permissions.
 */
contract DxController is Initializable {
    using SafeMathUpgradeable for uint256;

    struct Scheme {
        bytes32 paramsHash; // a hash voting parameters of the scheme
        bool isRegistered;
        bool canManageSchemes;
        bool canMakeAvatarCalls;
    }

    address[] public schemesAddresses;
    mapping(address => Scheme) public schemes;
    uint256 public schemesWithManageSchemesPermission;

    event RegisterScheme(address indexed _sender, address indexed _scheme);
    event UnregisterScheme(address indexed _sender, address indexed _scheme);

    function initialize(address _scheme) public initializer {
        schemes[_scheme] = Scheme({
            paramsHash: bytes32(0),
            isRegistered: true,
            canManageSchemes: true,
            canMakeAvatarCalls: true
        });
        schemesWithManageSchemesPermission = 1;
    }

    modifier onlyRegisteredScheme() {
        require(schemes[msg.sender].isRegistered, "DxController: Sender is not a registered scheme");
        _;
    }

    modifier onlyRegisteringSchemes() {
        require(schemes[msg.sender].canManageSchemes, "DxController: Sender cannot manage schemes");
        _;
    }

    modifier onlyAvatarCallScheme() {
        require(schemes[msg.sender].canMakeAvatarCalls, "DxController: Sender cannot perform avatar calls");
        _;
    }

    /**
     * @dev register a scheme
     * @param _scheme the address of the scheme
     * @param _paramsHash a hashed configuration of the usage of the scheme
     * @param _canManageSchemes whether the scheme is able to manage schemes
     * @param _canMakeAvatarCalls whether the scheme is able to make avatar calls
     * @return bool success of the operation
     */
    function registerScheme(
        address _scheme,
        bytes32 _paramsHash,
        bool _canManageSchemes,
        bool _canMakeAvatarCalls
    ) external onlyRegisteredScheme onlyRegisteringSchemes returns (bool) {
        Scheme memory scheme = schemes[_scheme];

        // produces non-zero if sender does not have permissions that are being updated
        require(
            (_canMakeAvatarCalls || scheme.canMakeAvatarCalls != _canMakeAvatarCalls)
                ? schemes[msg.sender].canMakeAvatarCalls
                : true,
            "DxController: Sender cannot add permissions sender doesn't have to a new scheme"
        );

        // Add or change the scheme:
        if ((!scheme.isRegistered || !scheme.canManageSchemes) && _canManageSchemes) {
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission.add(1);
        }

        schemes[_scheme] = Scheme({
            paramsHash: _paramsHash,
            isRegistered: true,
            canManageSchemes: _canManageSchemes,
            canMakeAvatarCalls: _canMakeAvatarCalls
        });

        emit RegisterScheme(msg.sender, _scheme);

        return true;
    }

    /**
     * @dev unregister a scheme
     * @param _scheme the address of the scheme
     * @return bool success of the operation
     */
    function unregisterScheme(address _scheme, address _avatar)
        external
        onlyRegisteredScheme
        onlyRegisteringSchemes
        returns (bool)
    {
        Scheme memory scheme = schemes[_scheme];

        //check if the scheme is registered
        if (_isSchemeRegistered(_scheme) == false) {
            return false;
        }

        if (scheme.isRegistered && scheme.canManageSchemes) {
            require(
                schemesWithManageSchemesPermission > 1,
                "DxController: Cannot unregister last scheme with manage schemes permission"
            );
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission.sub(1);
        }

        emit UnregisterScheme(msg.sender, _scheme);

        schemes[_scheme] = Scheme({
            paramsHash: bytes32(0),
            isRegistered: false,
            canManageSchemes: false,
            canMakeAvatarCalls: false
        });
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
    function avatarCall(
        address _contract,
        bytes calldata _data,
        DxAvatar _avatar,
        uint256 _value
    ) external onlyRegisteredScheme onlyAvatarCallScheme returns (bool, bytes memory) {
        return _avatar.executeCall(_contract, _data, _value);
    }

    function isSchemeRegistered(address _scheme) external view returns (bool) {
        return _isSchemeRegistered(_scheme);
    }

    function getSchemeParameters(address _scheme) external view returns (bytes32) {
        return schemes[_scheme].paramsHash;
    }

    function getSchemeCanManageSchemes(address _scheme) external view returns (bool) {
        return schemes[_scheme].canManageSchemes;
    }

    function getSchemeCanMakeAvatarCalls(address _scheme) external view returns (bool) {
        return schemes[_scheme].canMakeAvatarCalls;
    }

    function getSchemesCountWithManageSchemesPermissions() external view returns (uint256) {
        return schemesWithManageSchemesPermission;
    }

    function _isSchemeRegistered(address _scheme) private view returns (bool) {
        return (schemes[_scheme].isRegistered);
    }
}
