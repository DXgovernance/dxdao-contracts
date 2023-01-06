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
    event RegisterScheme(address indexed sender, address indexed scheme);

    /// @notice Emited once scheme has been unregistered
    event UnregisterScheme(address indexed sender, address indexed scheme);

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
     * @param scheme The address of the scheme
     * @param reputationTokenAddress The address of the reputation token
     * @param paramsHash A hashed configuration of the usage of the default scheme created on initialization
     */
    function initialize(
        address scheme,
        address reputationTokenAddress,
        bytes32 paramsHash
    ) public initializer {
        schemes[scheme] = Scheme({
            paramsHash: paramsHash,
            isRegistered: true,
            canManageSchemes: true,
            canMakeAvatarCalls: true,
            canChangeReputation: true
        });
        schemesWithManageSchemesPermission = 1;
        reputationToken = DAOReputation(reputationTokenAddress);
    }

    /**
     * @dev Register a scheme
     * @param schemeAddress The address of the scheme
     * @param paramsHash A hashed configuration of the usage of the scheme
     * @param canManageSchemes Whether the scheme is able to manage schemes
     * @param canMakeAvatarCalls Whether the scheme is able to make avatar calls
     * @param canChangeReputation Whether the scheme is able to change reputation
     * @return success Success of the operation
     */
    function registerScheme(
        address schemeAddress,
        bytes32 paramsHash,
        bool canManageSchemes,
        bool canMakeAvatarCalls,
        bool canChangeReputation
    ) external onlyRegisteredScheme onlyRegisteringSchemes returns (bool success) {
        Scheme memory scheme = schemes[schemeAddress];

        // Add or change the scheme:
        if ((!scheme.isRegistered || !scheme.canManageSchemes) && canManageSchemes) {
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission + 1;
        } else if (scheme.canManageSchemes && !canManageSchemes) {
            if (schemesWithManageSchemesPermission <= 1) {
                revert DAOController__CannotDisableLastSchemeWithManageSchemesPermission();
            }
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission - 1;
        }

        schemes[schemeAddress] = Scheme({
            paramsHash: paramsHash,
            isRegistered: true,
            canManageSchemes: canManageSchemes,
            canMakeAvatarCalls: canMakeAvatarCalls,
            canChangeReputation: canChangeReputation
        });

        emit RegisterScheme(msg.sender, schemeAddress);

        return true;
    }

    /**
     * @dev Unregister a scheme
     * @param schemeAddress The address of the scheme to unregister/delete from `schemes` mapping
     * @return success Success of the operation
     */
    function unregisterScheme(address schemeAddress)
        external
        onlyRegisteredScheme
        onlyRegisteringSchemes
        returns (bool success)
    {
        Scheme memory scheme = schemes[schemeAddress];

        //check if the scheme is registered
        if (_isSchemeRegistered(schemeAddress) == false) {
            return false;
        }

        if (scheme.canManageSchemes) {
            if (schemesWithManageSchemesPermission <= 1) {
                revert DAOController__CannotUnregisterLastSchemeWithManageSchemesPermission();
            }
            schemesWithManageSchemesPermission = schemesWithManageSchemesPermission - 1;
        }
        delete schemes[schemeAddress];

        emit UnregisterScheme(msg.sender, schemeAddress);

        return true;
    }

    /**
     * @dev Perform a generic call to an arbitrary contract
     * @param to  The contract's address to call
     * @param data ABI-encoded contract call to call `_contract` address.
     * @param avatar The controller's avatar address
     * @param value Value (ETH) to transfer with the transaction
     * @return callSuccess Whether call was executed successfully or not
     * @return callData Call data returned
     */
    function avatarCall(
        address to,
        bytes calldata data,
        DAOAvatar avatar,
        uint256 value
    ) external onlyRegisteredScheme onlyAvatarCallScheme returns (bool callSuccess, bytes memory callData) {
        return avatar.executeCall(to, data, value);
    }

    /**
     * @dev Burns dao reputation
     * @param amount  The amount of reputation to burn
     * @param account  The account to burn reputation from
     * @return success True if the reputation are burned correctly
     */
    function burnReputation(uint256 amount, address account) external onlyChangingReputation returns (bool success) {
        return reputationToken.burn(account, amount);
    }

    /**
     * @dev Mints dao reputation
     * @param amount  The amount of reputation to mint
     * @param account  The account to mint reputation from
     * @return success True if the reputation are generated correctly
     */
    function mintReputation(uint256 amount, address account) external onlyChangingReputation returns (bool success) {
        return reputationToken.mint(account, amount);
    }

    /**
     * @dev Transfer ownership of dao reputation
     * @param newOwner The new owner of the reputation token
     */
    function transferReputationOwnership(address newOwner)
        external
        onlyRegisteringSchemes
        onlyAvatarCallScheme
        onlyChangingReputation
    {
        reputationToken.transferOwnership(newOwner);
    }

    /**
     * @dev Returns whether a scheme is registered or not
     * @param scheme The address of the scheme
     * @return isRegistered Whether a scheme is registered or not
     */
    function isSchemeRegistered(address scheme) external view returns (bool isRegistered) {
        return _isSchemeRegistered(scheme);
    }

    /**
     * @dev Returns scheme paramsHash
     * @param scheme The address of the scheme
     * @return paramsHash scheme.paramsHash
     */
    function getSchemeParameters(address scheme) external view returns (bytes32 paramsHash) {
        return schemes[scheme].paramsHash;
    }

    /**
     * @dev Returns if scheme can manage schemes
     * @param scheme The address of the scheme
     * @return canManageSchemes scheme.canManageSchemes
     */
    function getSchemeCanManageSchemes(address scheme) external view returns (bool canManageSchemes) {
        return schemes[scheme].canManageSchemes;
    }

    /**
     * @dev Returns if scheme can make avatar calls
     * @param scheme The address of the scheme
     * @return canMakeAvatarCalls scheme.canMakeAvatarCalls
     */
    function getSchemeCanMakeAvatarCalls(address scheme) external view returns (bool canMakeAvatarCalls) {
        return schemes[scheme].canMakeAvatarCalls;
    }

    /**
     * @dev Returns if scheme can change reputation
     * @param scheme The address of the scheme
     * @return canChangeReputation scheme.canChangeReputation
     */
    function getSchemeCanChangeReputation(address scheme) external view returns (bool canChangeReputation) {
        return schemes[scheme].canChangeReputation;
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

    function _isSchemeRegistered(address scheme) private view returns (bool) {
        return (schemes[scheme].isRegistered);
    }

    /**
     * @dev Function to get reputation token
     * @return tokenAddress The reputation token set on controller.initialize
     */
    function getDaoReputation() external view returns (DAOReputation tokenAddress) {
        return reputationToken;
    }
}
