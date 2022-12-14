// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "./DAOAvatar.sol";
import "./DAOReputation.sol";

/**
 * @title DAO Controller
 * @dev A controller controls and connect the organizations schemes, reputation and avatar.
 * The schemes execute proposals through the controller to the avatar.
 * Each scheme has it own parameters and operation permissions.
 */
contract DAOController is Initializable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    struct Scheme {
        bytes32 paramsHash; // a hash voting parameters of the scheme
        bool isRegistered;
        bool canManageSchemes;
        bool canMakeAvatarCalls;
        bool canChangeReputation;
    }
    struct ProposalAndScheme {
        bytes32 proposalId;
        address scheme;
    }

    /// @notice Mapping that return scheme address for the given proposal ID
    mapping(bytes32 => address) public schemeOfProposal;

    /// @notice Mapping that return scheme struct for the given scheme address
    mapping(address => Scheme) public schemes;

    /// @notice The non-transferable ERC20 token that will be used as voting power
    DAOReputation public reputationToken;
    uint256 public schemesWithManageSchemesPermission;

    /// @notice Emited once scheme has been registered
    event RegisterScheme(address indexed _sender, address indexed _scheme);

    /// @notice Emited once scheme has been unregistered
    event UnregisterScheme(address indexed _sender, address indexed _scheme);

    /// @notice Sender is not a registered scheme
    error DAOController__SenderNotRegistered();

    /// @notice Sender cannot manage schemes
    error DAOController__SenderCannotManageSchemes();

    /// @notice Sender cannot perform avatar calls
    error DAOController__SenderCannotPerformAvatarCalls();

    /// @notice Sender cannot change reputation
    error DAOController__SenderCannotChangeReputation();

    /// @notice Cannot disable canManageSchemes property from the last scheme with manage schemes permissions
    error DAOController__CannotDisableLastSchemeWithManageSchemesPermission();

    /// @notice Cannot unregister last scheme with manage schemes permission
    error DAOController__CannotUnregisterLastSchemeWithManageSchemesPermission();

    /// @notice Sender is not the scheme that originally started the proposal
    error DAOController__SenderIsNotTheProposer();

    /// @notice Sender is not a registered scheme or proposal is not active
    error DAOController__SenderIsNotRegisteredOrProposalIsInactive();

    /// @dev Verify if scheme is registered
    modifier onlyRegisteredScheme() {
        if (!schemes[msg.sender].isRegistered) {
            revert DAOController__SenderNotRegistered();
        }
        _;
    }
    /// @dev Verify if scheme can manage schemes
    modifier onlyRegisteringSchemes() {
        if (!schemes[msg.sender].canManageSchemes) {
            revert DAOController__SenderCannotManageSchemes();
        }
        _;
    }

    /// @dev Verify if scheme can make avatar calls
    modifier onlyAvatarCallScheme() {
        if (!schemes[msg.sender].canMakeAvatarCalls) {
            revert DAOController__SenderCannotPerformAvatarCalls();
        }
        _;
    }

    /// @dev Verify if scheme can change reputation
    modifier onlyChangingReputation() {
        if (!schemes[msg.sender].canChangeReputation) {
            revert DAOController__SenderCannotChangeReputation();
        }
        _;
    }

    /**
     * @dev Initialize the Controller contract.
     * @param _scheme The address of the scheme
     * @param _reputationToken The address of the reputation token
     * @param _paramsHash A hashed configuration of the usage of the default scheme created on initialization
     */
    function initialize(
        address _scheme,
        address _reputationToken,
        bytes32 _paramsHash
    ) public initializer {
        schemes[_scheme] = Scheme({
            paramsHash: _paramsHash,
            isRegistered: true,
            canManageSchemes: true,
            canMakeAvatarCalls: true,
            canChangeReputation: true
        });
        schemesWithManageSchemesPermission = 1;
        reputationToken = DAOReputation(_reputationToken);
    }

    /**
     * @dev Register a scheme
     * @param _scheme The address of the scheme
     * @param _paramsHash A hashed configuration of the usage of the scheme
     * @param _canManageSchemes Whether the scheme is able to manage schemes
     * @param _canMakeAvatarCalls Whether the scheme is able to make avatar calls
     * @param _canChangeReputation Whether the scheme is able to change reputation
     * @return success Success of the operation
     */
    function registerScheme(
        address _scheme,
        bytes32 _paramsHash,
        bool _canManageSchemes,
        bool _canMakeAvatarCalls,
        bool _canChangeReputation
    ) external onlyRegisteredScheme onlyRegisteringSchemes returns (bool success) {
        Scheme memory scheme = schemes[_scheme];

        // Add or change the scheme:
        if ((!scheme.isRegistered || !scheme.canManageSchemes) && _canManageSchemes) {
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission + 1;
        } else if (scheme.canManageSchemes && !_canManageSchemes) {
            if (schemesWithManageSchemesPermission <= 1) {
                revert DAOController__CannotDisableLastSchemeWithManageSchemesPermission();
            }
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission - 1;
        }

        schemes[_scheme] = Scheme({
            paramsHash: _paramsHash,
            isRegistered: true,
            canManageSchemes: _canManageSchemes,
            canMakeAvatarCalls: _canMakeAvatarCalls,
            canChangeReputation: _canChangeReputation
        });

        emit RegisterScheme(msg.sender, _scheme);

        return true;
    }

    /**
     * @dev Unregister a scheme
     * @param _scheme The address of the scheme to unregister/delete from `schemes` mapping
     * @return success Success of the operation
     */
    function unregisterScheme(address _scheme)
        external
        onlyRegisteredScheme
        onlyRegisteringSchemes
        returns (bool success)
    {
        Scheme memory scheme = schemes[_scheme];

        //check if the scheme is registered
        if (_isSchemeRegistered(_scheme) == false) {
            return false;
        }

        if (scheme.canManageSchemes) {
            if (schemesWithManageSchemesPermission <= 1) {
                revert DAOController__CannotUnregisterLastSchemeWithManageSchemesPermission();
            }
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission - 1;
        }
        delete schemes[_scheme];

        emit UnregisterScheme(msg.sender, _scheme);

        return true;
    }

    /**
     * @dev Perform a generic call to an arbitrary contract
     * @param _contract  The contract's address to call
     * @param _data ABI-encoded contract call to call `_contract` address.
     * @param _avatar The controller's avatar address
     * @param _value Value (ETH) to transfer with the transaction
     * @return success Whether call was executed successfully or not
     * @return data Call data returned
     */
    function avatarCall(
        address _contract,
        bytes calldata _data,
        DAOAvatar _avatar,
        uint256 _value
    ) external onlyRegisteredScheme onlyAvatarCallScheme returns (bool success, bytes memory data) {
        return _avatar.executeCall(_contract, _data, _value);
    }

    /**
     * @dev Burns dao reputation
     * @param _amount  The amount of reputation to burn
     * @param _account  The account to burn reputation from
     * @return success True if the reputation are burned correctly
     */
    function burnReputation(uint256 _amount, address _account) external onlyChangingReputation returns (bool success) {
        return reputationToken.burn(_account, _amount);
    }

    /**
     * @dev Mints dao reputation
     * @param _amount  The amount of reputation to mint
     * @param _account  The account to mint reputation from
     * @return success True if the reputation are generated correctly
     */
    function mintReputation(uint256 _amount, address _account) external onlyChangingReputation returns (bool success) {
        return reputationToken.mint(_account, _amount);
    }

    /**
     * @dev Transfer ownership of dao reputation
     * @param _newOwner The new owner of the reputation token
     */
    function transferReputationOwnership(address _newOwner)
        external
        onlyRegisteringSchemes
        onlyAvatarCallScheme
        onlyChangingReputation
    {
        reputationToken.transferOwnership(_newOwner);
    }

    /**
     * @dev Returns whether a scheme is registered or not
     * @param _scheme The address of the scheme
     * @return isRegistered Whether a scheme is registered or not
     */
    function isSchemeRegistered(address _scheme) external view returns (bool isRegistered) {
        return _isSchemeRegistered(_scheme);
    }

    /**
     * @dev Returns scheme paramsHash
     * @param _scheme The address of the scheme
     * @return paramsHash scheme.paramsHash
     */
    function getSchemeParameters(address _scheme) external view returns (bytes32 paramsHash) {
        return schemes[_scheme].paramsHash;
    }

    /**
     * @dev Returns if scheme can manage schemes
     * @param _scheme The address of the scheme
     * @return canManageSchemes scheme.canManageSchemes
     */
    function getSchemeCanManageSchemes(address _scheme) external view returns (bool canManageSchemes) {
        return schemes[_scheme].canManageSchemes;
    }

    /**
     * @dev Returns if scheme can make avatar calls
     * @param _scheme The address of the scheme
     * @return canMakeAvatarCalls scheme.canMakeAvatarCalls
     */
    function getSchemeCanMakeAvatarCalls(address _scheme) external view returns (bool canMakeAvatarCalls) {
        return schemes[_scheme].canMakeAvatarCalls;
    }

    /**
     * @dev Returns if scheme can change reputation
     * @param _scheme The address of the scheme
     * @return canChangeReputation scheme.canChangeReputation
     */
    function getSchemeCanChangeReputation(address _scheme) external view returns (bool canChangeReputation) {
        return schemes[_scheme].canChangeReputation;
    }

    /**
     * @dev Returns the amount of schemes with manage schemes permission
     * @return schemesWithManageSchemesPermissionCount Schemes with manage schemes permission count
     */
    function getSchemesWithManageSchemesPermissionsCount()
        external
        view
        returns (uint256 schemesWithManageSchemesPermissionCount)
    {
        return schemesWithManageSchemesPermission;
    }

    function _isSchemeRegistered(address _scheme) private view returns (bool) {
        return (schemes[_scheme].isRegistered);
    }

    /**
     * @dev Function to get reputation token
     * @return tokenAddress The reputation token set on controller.initialize
     */
    function getDaoReputation() external view returns (DAOReputation tokenAddress) {
        return reputationToken;
    }
}
