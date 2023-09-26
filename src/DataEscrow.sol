// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract DataEscrow is Ownable {
    using Address for address payable;

    struct DataPart {
        uint16 index;
        uint256 price;
    }

    enum PartBuyerState { Offered, Considered, Accepted, Rejected }

    event Deposited(address indexed payee, uint256 weiAmount, uint16 dataPartID);
    event Released(address indexed payee, uint256 weiAmount, uint16 dataPartID);
    event Withdrawn(address indexed payee, uint256 weiAmount, uint16 dataPartID);
    event PartBuyerStateChanged(address indexed payee, uint16 dataPartID, PartBuyerState state);

    address payable private immutable _beneficiary;
    bytes32 private _blockHash;
    uint16[] private _dataPartIDs;

    mapping(uint16 => uint256) private _dataPartPrices;
    mapping(address => mapping(uint16 => uint256)) private _depositParts;
    mapping(address => mapping(uint16 => PartBuyerState)) private _partBuyerStates;

    constructor(address payable beneficiary_, bytes32 blockhash_, DataPart[] memory dataParts_) {
        for (uint256 i = 0; i < dataParts_.length; i++) {
            _dataPartIDs.push(dataParts_[i].index);
            _dataPartPrices[dataParts_[i].index] = dataParts_[i].price;
        }
        _blockHash = blockhash_;
        _beneficiary = beneficiary_;
    }

    function blockHash() public view returns (bytes32) {
        return _blockHash;
    }

    function dataPartIDs() public view returns (DataPart[] memory) {
        DataPart[] memory _dataParts = new DataPart[](_dataPartIDs.length);
        for (uint256 i = 0; i < _dataPartIDs.length; i++) {
            _dataParts[i] = DataPart(_dataPartIDs[i], _dataPartPrices[_dataPartIDs[i]]);
        }
        return _dataParts;
    }

    function fullDepositOf(address payee) public view returns (uint256) {
        uint256 _fullDeposit = 0;

        for (uint256 i = 0; i < _dataPartIDs.length; i++) {
            _fullDeposit += _depositParts[payee][_dataPartIDs[i]];
        }
        return _fullDeposit;
    }

    function depositOf(address payee, uint16 dataPartID) public view returns (uint256) {
        return _depositParts[payee][dataPartID];
    }

    function depositsOf(address payee) public view returns (DataPart[] memory) {
        DataPart[] memory _dataParts = new DataPart[](_dataPartIDs.length);
        for (uint256 i = 0; i < _dataPartIDs.length; i++) {
            _dataParts[i] = DataPart(_dataPartIDs[i], _depositParts[payee][_dataPartIDs[i]]);
        }
        return _dataParts;
    }

    /**
     * @dev Returns whether an address can buy a part (only if all previous parts are accepted)
     * @param payee The address of the buyer.
     * @param dataPartID The ID of the data part.
     */
    function canBuyPart(address payee, uint16 dataPartID) public view returns (bool) {
        bool allPreviousAccepted = true;
        for (uint256 i = 0; i < _dataPartIDs.length; i++) {
            if (_dataPartIDs[i] == dataPartID) {
                break;
            }
            if (_partBuyerStates[payee][_dataPartIDs[i]] != PartBuyerState.Accepted) {
                allPreviousAccepted = false;
                break;
            }
        }
        return allPreviousAccepted;
    }

    /**
     * @dev Stores the amount of money sent by `msg.sender` in the escrow, if sender can buy the part.
     * @param payee The destination address of the funds.
     *
     * Emits a {Deposited} event.
     */
    function deposit(address payee, uint16 dataPartID) public payable {
        require(canBuyPart(payee, dataPartID), "DataEscrow: cannot buy part");

        uint256 amount = msg.value;
        _depositParts[payee][dataPartID] += amount;
        emit Deposited(payee, amount, dataPartID);

        if (_depositParts[payee][dataPartID] >= _dataPartPrices[dataPartID]) {
            _partBuyerStates[payee][dataPartID] = PartBuyerState.Considered;
            emit PartBuyerStateChanged(payee, dataPartID, PartBuyerState.Considered);
        }
    }

    /**
     * @dev Release funds for the paid part which has been considered and accept the data. The part price is
     * transferred to beneficiary, the remainder is transferred to the buyer.
     * @param payee The address of the buyer.
     * @param dataPartID The ID of the data part.
     * 
     * Emits a {Released} event.
     */
    function release(address payable payee, uint16 dataPartID) public virtual onlyOwner {
        require(_partBuyerStates[payee][dataPartID] == PartBuyerState.Considered, "DataEscrow: part not considered");
        require(_depositParts[payee][dataPartID] >= _dataPartPrices[dataPartID], "DataEscrow: insufficient deposit");

        uint256 payment = _dataPartPrices[dataPartID];
        uint256 remaining = _depositParts[payee][dataPartID] - payment;

        _depositParts[payee][dataPartID] = 0;
        _partBuyerStates[payee][dataPartID] = PartBuyerState.Accepted;

        _beneficiary.sendValue(payment);
        if (remaining > 0) {
            payee.sendValue(remaining);
        }
        emit Released(payee, payment, dataPartID);
        emit PartBuyerStateChanged(payee, dataPartID, PartBuyerState.Accepted);
    }

    /**
     * @dev Withdraw accumulated balance for a payee, forwarding all gas to the
     * recipient.
     *
     * WARNING: Forwarding all gas opens the door to reentrancy vulnerabilities.
     * Make sure you trust the recipient, or are either following the
     * checks-effects-interactions pattern or using {ReentrancyGuard}.
     *
     * @param payee The address whose funds will be withdrawn and transferred to.
     *
     * Emits a {Withdrawn} event.
     */
    function withdraw(address payable payee, uint16 dataPartID) public {
        uint256 payment = _depositParts[payee][dataPartID];

        _depositParts[payee][dataPartID] = 0;
        _partBuyerStates[payee][dataPartID] = PartBuyerState.Rejected;

        payee.sendValue(payment);
        emit Withdrawn(payee, payment, dataPartID);
        emit PartBuyerStateChanged(payee, dataPartID, PartBuyerState.Rejected);
    }
}