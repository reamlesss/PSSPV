const net = require("net");
const fs = require("fs");
const os = require("os");

// Konfigurace
const PORT = process.env.PORT || 65525;
const DATA_FILE = "bank_data.json";

// Načtení dat
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

// TCP server
const server = net.createServer((socket) => {
  socket.setEncoding("utf-8");

  let buffer = ""; // Uchováváme přijatá data, než přijde celý řádek

  socket.on("data", (data) => {
    buffer += data;

    let lines = buffer.split("\n");
    buffer = lines.pop();

    lines.forEach((line) => handleCommand(line.trim(), socket));
  });

  socket.on("error", (err) => console.error("🚨 Chyba socketu:", err.message));
  socket.on("end", () => console.log("🔌 Klient odpojen"));
});

// Zpracování příkazů
function handleCommand(command, socket) {
  if (!command) return;

  console.log("📩 Příkaz přijat:", JSON.stringify(command));

  const [cmd, ...args] = command.trim().split(/\s+/);

  switch (cmd.toUpperCase()) {
    case "BC":
      socket.write(`BC ${getIPAddress()}\n`);
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

// Pomocné funkce
function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1"; // Pokud není dostupná veřejná IP
}

function createAccount(socket) {
  if (Object.keys(bankData.accounts).length >= 90000) {
    socket.write("ER Naše banka nyní neumožňuje založení nového účtu.\n");
    return;
  }
  const accountId = generateUniqueAccountId();
  bankData.accounts[accountId] = 0;
  saveBankData();
  socket.write(`AC ${accountId}/${getIPAddress()}\n`);
}

function generateUniqueAccountId() {
  let accountId;
  do {
    accountId = Math.floor(10000 + Math.random() * 90000);
  } while (bankData.accounts[accountId] !== undefined);
  return accountId;
}

function deposit(socket, args) {
  if (args.length !== 2) {
    socket.write(
      "ER číslo bankovního účtu a částka není ve správném formátu.\n"
    );
    return;
  }

  const [accountInfo, amountStr] = args;
  const [account, bankCode] = accountInfo.split("/");
  const amount = parseInt(amountStr, 10);

  if (!isValidAccount(account, bankCode) || isNaN(amount) || amount <= 0) {
    socket.write(
      "ER číslo bankovního účtu a částka není ve správném formátu.\n"
    );
    return;
  }

  bankData.accounts[account] += amount;
  bankData.totalAmount += amount;
  saveBankData();
  socket.write(`AD\n`);
}

function withdraw(socket, args) {
  if (args.length !== 2) {
    socket.write(
      "ER číslo bankovního účtu a částka není ve správném formátu.\n"
    );
    return;
  }

  const [accountInfo, amountStr] = args;
  const [account, bankCode] = accountInfo.split("/");
  const amount = parseInt(amountStr, 10);

  if (!isValidAccount(account, bankCode) || isNaN(amount) || amount <= 0) {
    socket.write(
      "ER číslo bankovního účtu a částka není ve správném formátu.\n"
    );
    return;
  }

  if (bankData.accounts[account] < amount) {
    socket.write("ER Není dostatek finančních prostředků.\n");
    return;
  }

  bankData.accounts[account] -= amount;
  bankData.totalAmount -= amount;
  saveBankData();
  socket.write(`AW\n`);
}

function checkBalance(socket, args) {
  if (args.length !== 1) {
    socket.write("ER Formát čísla účtu není správný.\n");
    return;
  }

  const [accountInfo] = args;
  const [account, bankCode] = accountInfo.split("/");

  if (!isValidAccount(account, bankCode)) {
    socket.write("ER Formát čísla účtu není správný.\n");
    return;
  }

  socket.write(`AB ${bankData.accounts[account]}\n`);
}

function removeAccount(socket, args) {
  if (args.length !== 1) {
    socket.write("ER Formát čísla účtu není správný.\n");
    return;
  }

  const [accountInfo] = args;
  const [account, bankCode] = accountInfo.split("/");

  if (!isValidAccount(account, bankCode)) {
    socket.write("ER Formát čísla účtu není správný.\n");
    return;
  }

  if (bankData.accounts[account] > 0) {
    socket.write("ER Nelze smazat bankovní účet na kterém jsou finance.\n");
    return;
  }

  delete bankData.accounts[account];
  saveBankData();
  socket.write(`AR\n`);
}

function bankTotalAmount(socket) {
  socket.write(`BA ${bankData.totalAmount}\n`);
}

function bankNumberOfClients(socket) {
  socket.write(`BN ${Object.keys(bankData.accounts).length}\n`);
}

function isValidAccount(account, bankCode) {
  return (
    bankData.accounts.hasOwnProperty(account) && bankCode === getIPAddress()
  );
}

// Spuštění serveru
server.listen(PORT, () => console.log(`🏦 Server běží na portu ${PORT}`));
