const net = require("net");
const fs = require("fs");

// Configuration
const PORT = process.env.PORT || 65525;
const TIMEOUT = process.env.TIMEOUT || 5000;
const DATA_FILE = "bank_data.json";

// Persistent storage
let bankData = loadBankData();

function loadBankData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }
  return { accounts: {}, totalAmount: 0 };
}

function saveBankData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(bankData, null, 2));
}

// Command handlers
function handleCommand(command, socket) {
  const [cmd, ...args] = command.split(" ");

  switch (cmd) {
    case "BC":
      socket.write(`BC ${getIPAddress()}\n`);
      break;
    case "AC":
      const accountId = createAccount();
      socket.write(`AC ${accountId}/${getIPAddress()}\n`);
      break;
    case "AD":
      const [account, amount] = args;
      if (deposit(account, parseInt(amount, 10))) {
        socket.write(`AD\n`);
      } else {
        socket.write(`ER Invalid deposit operation\n`);
      }
      break;
    // Add other commands here
    default:
      socket.write(`ER Unknown command\n`);
  }
}

// TCP server
const server = net.createServer((socket) => {
  socket.setEncoding("utf-8");
  socket.setTimeout(TIMEOUT);

  socket.on("data", (data) => {
    const commands = data.trim().split("\n");
    commands.forEach((cmd) => handleCommand(cmd, socket));
  });

  socket.on("timeout", () => {
    socket.write("ER Request timeout\n");
    socket.end();
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err.message);
  });

  socket.on("end", () => {
    console.log("Client disconnected");
  });
});

// Helper functions
function getIPAddress() {
  // Replace with logic to get the actual IP address
  return "127.0.0.1";
}

function createAccount() {
  const accountId = Math.floor(10000 + Math.random() * 90000);
  bankData.accounts[accountId] = 0;
  saveBankData();
  return accountId;
}

function deposit(account, amount) {
  if (bankData.accounts[account] !== undefined && amount > 0) {
    bankData.accounts[account] += amount;
    saveBankData();
    return true;
  }
  return false;
}

// Start server
server.listen(PORT, () => {
  console.log(`Bank server listening on port ${PORT}`);
});
