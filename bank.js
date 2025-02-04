/**
 * Module dependencies.
 */
const net = require("net");
const fs = require("fs");
const os = require("os");
require("dotenv").config();

/**
 * Constants
 */
const PORT = process.env.PORT || 65525;
const BANK_IP = getIPAddress(); 
const DATA_FILE = "bank_data.json";
const TIMEOUT = process.env.Timeout ? parseInt(process.env.Timeout, 10) : 5000;


/**
 * Load initial bank data
 */
let bankData = loadBankData();

/**
 * Load bank data from file
 * @returns {Object} Bank data
 */
function loadBankData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }
  return { accounts: {}, totalAmount: 0 };
}

/**
 * Save bank data to file
 */
function saveBankData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(bankData, null, 2));
}

/**
 * Create a TCP server
 */
const server = net.createServer((socket) => {
  socket.setEncoding("utf-8");
  socket.setTimeout(TIMEOUT);

  let buffer = ""; 

  socket.on("data", (data) => {
    buffer += data;

    let lines = buffer.split("\n");
    buffer = lines.pop();

    lines.forEach((line) => handleCommand(line.trim(), socket));
  });

  socket.on("error", (err) => console.error("🚨 Socket Error:", err.message));
  socket.on("end", () => console.log("🔌 Client disconnected"));
  socket.on("timeout", () => {
    console.log("⚠ Timeout.");
    socket.write("ER Timeout occurred.\n");
    socket.end();
  });

});

/**
 * Handle incoming commands
 * @param {string} command - The command received
 * @param {net.Socket} socket - The socket connection
 */
function handleCommand(command, socket) {
  if (!command) return;

  console.log("📩 Command received:", JSON.stringify(command));

  const [cmd, ...args] = command.trim().split(/\s+/);

  switch (cmd.toUpperCase()) {
    case "BC":
      socket.write(`BC ${BANK_IP}\n`);
      break;
    case "AC":
      createAccount(socket);
      break;
    case "AD":
      deposit(socket, args);
      break;
    case "AW":
      withdraw(socket, args);
      break;
    case "AB":
      checkBalance(socket, args);
      break;
    case "AR":
      removeAccount(socket, args);
      break;
    case "BA":
      bankTotalAmount(socket);
      break;
    case "BN":
      bankNumberOfClients(socket);
      break;
    default:
      socket.write("ER Unknown command\n");
  }
}

/**
 * Get the IP address of the current machine
 * @returns {string} IP address
 */
function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1"; // If no public IP is available
}

/**
 * Create a new bank account
 * @param {net.Socket} socket - The socket connection
 */
function createAccount(socket) {
  if (Object.keys(bankData.accounts).length >= 90000) {
    socket.write("ER Our bank currently does not allow the creation of new accounts.\n");
    return;
  }
  const accountId = generateUniqueAccountId();
  bankData.accounts[accountId] = 0;
  saveBankData();
  socket.write(`AC ${accountId}/${BANK_IP}\n`);
}

/**
 * Generate a unique account ID
 * @returns {number} Account ID
 */
function generateUniqueAccountId() {
  let accountId;
  do {
    accountId = Math.floor(10000 + Math.random() * 90000);
  } while (bankData.accounts[accountId] !== undefined);
  return accountId;
}

/**
 * Forward command to another bank
 * @param {string} bankIP - The IP address of the other bank
 * @param {string} command - The command to forward
 * @param {net.Socket} socket - The socket connection
 */
function forwardCommandToBank(bankIP, command, socket) {
  const client = new net.Socket();
  client.setEncoding("utf-8");

  client.connect(PORT, bankIP, () => {
    console.log(`🔗 Connected to bank ${bankIP}`);
    client.write(command + "\n");
  });

  client.on("data", (data) => {
    console.log(`📨 Response from bank ${bankIP}: ${data.trim()}`);
    socket.write(data);
    client.end();
  });

  client.on("error", (err) => {
    console.error(`🚨 Error communicating with bank ${bankIP}: ${err.message}`);
    socket.write("ER Failed to contact another bank.\n");
    client.destroy();
  });

  client.on("close", () => {
    console.log(`🔌 Connection to bank ${bankIP} closed.`);
  });
}

/**
 * Deposit money into an account
 * @param {net.Socket} socket - The socket connection
 * @param {Array} args - The command arguments
 */
function deposit(socket, args) {
  if (args.length !== 2) {
    socket.write(
      "ER The bank account number and amount are not in the correct format.\n"
    );
    return;
  }

  const [accountInfo, amountStr] = args;
  const [account, bankCode] = accountInfo.split("/");
  const amount = parseInt(amountStr, 10);

  if (isNaN(amount) || amount <= 0) {
    socket.write("ER The amount must be a positive number.\n");
    return;
  }

  if (bankCode !== BANK_IP) {
    forwardCommandToBank(bankCode, `AD ${accountInfo} ${amount}`, socket);
    return;
  }

  if (!bankData.accounts.hasOwnProperty(account)) {
    socket.write("ER Non-existent account.\n");
    return;
  }

  bankData.accounts[account] += amount;
  bankData.totalAmount += amount;
  saveBankData();
  socket.write(`AD\n`);
}

/**
 * Withdraw money from an account
 * @param {net.Socket} socket - The socket connection
 * @param {Array} args - The command arguments
 */
function withdraw(socket, args) {
  if (args.length !== 2) {
    socket.write(
      "ER The bank account number and amount are not in the correct format.\n"
    );
    return;
  }

  const [accountInfo, amountStr] = args;
  const [account, bankCode] = accountInfo.split("/");
  const amount = parseInt(amountStr, 10);

  if (isNaN(amount) || amount <= 0) {
    socket.write("ER The amount must be a positive number.\n");
    return;
  }

  if (bankCode !== BANK_IP) {
    forwardCommandToBank(bankCode, `AW ${accountInfo} ${amount}`, socket);
    return;
  }

  if (!bankData.accounts.hasOwnProperty(account)) {
    socket.write("ER Non-existent account.\n");
    return;
  }

  if (bankData.accounts[account] < amount) {
    socket.write("ER Insufficient funds.\n");
    return;
  }

  bankData.accounts[account] -= amount;
  bankData.totalAmount -= amount;
  saveBankData();
  socket.write(`AW\n`);
}

/**
 * Check the balance of an account
 * @param {net.Socket} socket - The socket connection
 * @param {Array} args - The command arguments
 */
function checkBalance(socket, args) {
  if (args.length !== 1) {
    socket.write("ER The account number format is incorrect.\n");
    return;
  }

  const [accountInfo] = args;
  const [account, bankCode] = accountInfo.split("/");

  if (bankCode !== BANK_IP) {
    forwardCommandToBank(bankCode, `AB ${accountInfo}`, socket);
    return;
  }

  if (!bankData.accounts.hasOwnProperty(account)) {
    socket.write("ER Non-existent account.\n");
    return;
  }

  socket.write(`AB 💸${bankData.accounts[account]}💸\n`);
}

/**
 * Remove a bank account
 * @param {net.Socket} socket - The socket connection
 * @param {Array} args - The command arguments
 */
function removeAccount(socket, args) {
  if (args.length !== 1) {
    socket.write("ER The account number format is incorrect.\n");
    return;
  }

  const [accountInfo] = args;
  const [account, bankCode] = accountInfo.split("/");

  if (!isValidAccount(account, bankCode)) {
    socket.write("ER The account number format is incorrect.\n");
    return;
  }

  if (bankData.accounts[account] > 0) {
    socket.write("ER Cannot delete an account with funds.\n");
    return;
  }

  delete bankData.accounts[account];
  saveBankData();
  socket.write(`AR\n`);
}

/**
 * Get the total amount of money in the bank
 * @param {net.Socket} socket - The socket connection
 */
function bankTotalAmount(socket) {
  socket.write(`BA ${bankData.totalAmount}\n`);
}

/**
 * Get the number of clients in the bank
 * @param {net.Socket} socket - The socket connection
 */
function bankNumberOfClients(socket) {
  socket.write(`BN ${Object.keys(bankData.accounts).length}\n`);
}

/**
 * Validate if the account is valid
 * @param {string} account - The account number
 * @param {string} bankCode - The bank code
 * @returns {boolean} True if valid, false otherwise
 */
function isValidAccount(account, bankCode) {
  return (bankData.accounts.hasOwnProperty(account) && bankCode === BANK_IP );
}

/**
 * Start the server
 */
server.listen(PORT, () => console.log(`🏦 Server running on port ${PORT}`));
