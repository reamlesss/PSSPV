/**
 * Module dependencies.
 */
const net = require("net");
const mysql = require("mysql");
const os = require("os");
const fs = require('fs');
require("dotenv").config();

/**
 * Constants
 */
const PORT = process.env.PORT || 65525;
const BANK_IP = getIPAddress(); // Use only getIPAddress function
const TIMEOUT = process.env.Timeout ? parseInt(process.env.Timeout, 10) : 5000;

/**
 * MySQL connection
 */
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'bank'
});

const logStream = fs.createWriteStream('bank.log', { flags: 'a' });

/**
 * Log messages to bank.log
 * @param {string} message - The message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
}

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.stack);
    log(`Error connecting to MySQL: ${err.stack}`);
    return;
  }
  console.log('Connected to MySQL as id ' + connection.threadId);
  log('Connected to MySQL as id ' + connection.threadId);
});

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

  socket.on("error", (err) => {
    console.error("🚨 Socket Error:", err.message);
    log(`Socket Error: ${err.message}`);
  });
  socket.on("end", () => {
    console.log("🔌 Client disconnected");
    log("Client disconnected");
  });
  socket.on("timeout", () => {
    console.log("⚠ Timeout.");
    log("Timeout occurred");
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
  log(`Command received: ${JSON.stringify(command)}`);

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
  connection.query('SELECT COUNT(*) AS count FROM accounts', (error, results) => {
    if (error) {
      log(`Error querying account count: ${error.message}`);
      throw error;
    }

    if (results[0].count >= 90000) {
      socket.write("ER Our bank currently does not allow the creation of new accounts.\n");
      return;
    }

    const accountId = generateUniqueAccountId();
    connection.query('INSERT INTO accounts (id, balance) VALUES (?, 0)', [accountId], (error) => {
      if (error) {
        log(`Error creating account ${accountId}: ${error.message}`);
        throw error;
      }
      socket.write(`AC ${accountId}/${BANK_IP}\n`);
      log(`Account created: ${accountId}`);
    });
  });
}

/**
 * Generate a unique account ID
 * @returns {number} Account ID
 */
function generateUniqueAccountId() {
  let accountId;
  do {
    accountId = Math.floor(10000 + Math.random() * 90000);
  } while (!isUniqueAccountId(accountId));
  return accountId;
}

/**
 * Check if the account ID is unique
 * @param {number} accountId - The account ID to check
 * @returns {boolean} True if unique, false otherwise
 */
function isUniqueAccountId(accountId) {
  return new Promise((resolve, reject) => {
    connection.query('SELECT id FROM accounts WHERE id = ?', [accountId], (error, results) => {
      if (error) return reject(error);
      resolve(results.length === 0);
    });
  });
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
    log(`Error communicating with bank ${bankIP}: ${err.message}`);
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

  connection.query('SELECT balance FROM accounts WHERE id = ?', [account], (error, results) => {
    if (error) {
      log(`Error querying balance for account ${account}: ${error.message}`);
      throw error;
    }

    if (results.length === 0) {
      socket.write("ER Non-existent account.\n");
      return;
    }

    const newBalance = results[0].balance + amount;
    connection.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account], (error) => {
      if (error) {
        log(`Error updating balance for account ${account}: ${error.message}`);
        throw error;
      }
      socket.write(`AD\n`);
      log(`Deposited ${amount} to account ${account}`);
    });
  });
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

  connection.query('SELECT balance FROM accounts WHERE id = ?', [account], (error, results) => {
    if (error) {
      log(`Error querying balance for account ${account}: ${error.message}`);
      throw error;
    }

    if (results.length === 0) {
      socket.write("ER Non-existent account.\n");
      return;
    }

    if (results[0].balance < amount) {
      socket.write("ER Insufficient funds.\n");
      return;
    }

    const newBalance = results[0].balance - amount;
    connection.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account], (error) => {
      if (error) {
        log(`Error updating balance for account ${account}: ${error.message}`);
        throw error;
      }
      socket.write(`AW\n`);
      log(`Withdrew ${amount} from account ${account}`);
    });
  });
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

  connection.query('SELECT balance FROM accounts WHERE id = ?', [account], (error, results) => {
    if (error) {
      log(`Error querying balance for account ${account}: ${error.message}`);
      throw error;
    }

    if (results.length === 0) {
      socket.write("ER Non-existent account.\n");
      return;
    }

    socket.write(`AB 💸${results[0].balance}💸\n`);
    log(`Checked balance for account ${account}: ${results[0].balance}`);
  });
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

  connection.query('SELECT balance FROM accounts WHERE id = ?', [account], (error, results) => {
    if (error) {
      log(`Error querying balance for account ${account}: ${error.message}`);
      throw error;
    }

    if (results.length === 0) {
      socket.write("ER Non-existent account.\n");
      return;
    }

    if (results[0].balance > 0) {
      socket.write("ER Cannot delete an account with funds.\n");
      return;
    }

    connection.query('DELETE FROM accounts WHERE id = ?', [account], (error) => {
      if (error) {
        log(`Error deleting account ${account}: ${error.message}`);
        throw error;
      }
      socket.write(`AR\n`);
      log(`Removed account ${account}`);
    });
  });
}

/**
 * Get the total amount of money in the bank
 * @param {net.Socket} socket - The socket connection
 */
function bankTotalAmount(socket) {
  connection.query('SELECT SUM(balance) AS totalAmount FROM accounts', (error, results) => {
    if (error) {
      log(`Error querying total amount: ${error.message}`);
      throw error;
    }
    socket.write(`BA ${results[0].totalAmount}\n`);
    log(`Total amount in bank: ${results[0].totalAmount}`);
  });
}

/**
 * Get the number of clients in the bank
 * @param {net.Socket} socket - The socket connection
 */
function bankNumberOfClients(socket) {
  connection.query('SELECT COUNT(*) AS count FROM accounts', (error, results) => {
    if (error) {
      log(`Error querying number of clients: ${error.message}`);
      throw error;
    }
    socket.write(`BN ${results[0].count}\n`);
    log(`Number of clients in bank: ${results[0].count}`);
  });
}

/**
 * Validate if the account is valid
 * @param {string} account - The account number
 * @param {string} bankCode - The bank code
 * @returns {boolean} True if valid, false otherwise
 */
function isValidAccount(account, bankCode) {
  return new Promise((resolve, reject) => {
    connection.query('SELECT id FROM accounts WHERE id = ?', [account], (error, results) => {
      if (error) return reject(error);
      resolve(results.length > 0 && bankCode === BANK_IP);
    });
  });
}

/**
 * Start the server
 */
server.listen(PORT, () => {
  console.log(`🏦 Server running on port ${PORT}`);
  log(`Server running on port ${PORT}`);
});
