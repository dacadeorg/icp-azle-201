import React from "react";
import { Dropdown, Stack } from "react-bootstrap";
import { NotificationSuccess } from "./utils/Notifications";
import { toast } from "react-toastify";

const Wallet = ({ address, principal, icpBalance, icrcBalance, symbol, isAuthenticated, destroy }) => {
  if (isAuthenticated) {
    return (
      <>
        <Dropdown>
          <Dropdown.Toggle
            variant="light"
            align="end"
            id="dropdown-basic"
            className="d-flex align-items-center border rounded-pill py-1"
          >
            {icrcBalance} <span className="ms-1"> {symbol}</span>
          </Dropdown.Toggle>

          <Dropdown.Menu className="shadow-lg border-0">
            <Dropdown.Item>
              <Stack direction="horizontal" gap={2}>
                <i className="bi bi-currency-dollar fs-4" />
                <span className="font-monospace">ICP Balance: {icpBalance}</span>
              </Stack>
            </Dropdown.Item>

            <Dropdown.Divider />

            <Dropdown.Item onClick={() => { navigator.clipboard.writeText(principal); toast(<NotificationSuccess text="Copied principal" />) }}>
              <Stack direction="horizontal" gap={2}>
                <i className="bi bi-person-circle fs-4" />
                <span className="font-monospace">Principal: {principal}</span>
              </Stack>
            </Dropdown.Item>

            <Dropdown.Divider />

            <Dropdown.Item onClick={() => { navigator.clipboard.writeText(address); toast(<NotificationSuccess text="Copied address" />) }}>
              <Stack direction="horizontal" gap={2}>
                <i className="bi bi-wallet2 fs-4" />
                <span className="font-monospace">Address: {address}</span>
              </Stack>
            </Dropdown.Item>

            <Dropdown.Divider />

            <Dropdown.Item
              as="button"
              className="d-flex align-items-center"
              onClick={() => {
                destroy();
              }}
            >
              <i className="bi bi-box-arrow-right me-2 fs-4" />
              Logout
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </>
    );
  }

  return null;
};

export default Wallet;
