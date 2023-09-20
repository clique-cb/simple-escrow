// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {DataEscrow} from "../src/DataEscrow.sol";

address payable constant SELF = payable(0xb4c79daB8f259C7Aee6E5b2Aa729821864227e84);

contract CounterTest is Test {
    DataEscrow public escrow;
    Vm.Wallet public beneficiary;
    Vm.Wallet public buyer;

    function setUp() public {
        string[5] memory dataPieces = ["a", "b", "c", "d", "e"];
        uint16[5] memory dataPrices = [1000, 1000, 1000, 1000, 0];

        DataEscrow.DataPart[] memory dataParts = new DataEscrow.DataPart[](dataPieces.length);
        for (uint256 i = 0; i < dataPieces.length; i++) {
            dataParts[i] = DataEscrow.DataPart(keccak256(abi.encodePacked(dataPieces[i])), dataPrices[i]);
        }

        beneficiary = vm.createWallet(uint256(keccak256(bytes("beneficiary"))));
        buyer = vm.createWallet("buyer");
        escrow = new DataEscrow(payable(beneficiary.addr), dataParts);
    }

    // function testView() public {
    //     DataEscrow.DataPart[] memory deposits = escrow.depositsOf(buyer.addr);
    //     for (uint256 i = 0; i < deposits.length; i++) {
    //         console2.log("deposit", string(abi.encodePacked(deposits[i].id)), deposits[i].price);
    //         assertEq(deposits[i].price, 0);
    //     }
    // }

    // function testSetNumber(uint256 x) public {
    //     counter.setNumber(x);
    //     assertEq(counter.number(), x);
    // }
}
