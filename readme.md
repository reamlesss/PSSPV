# Pear2Pear Bank system

This project implements a **peer-to-peer (P2P) banking system** in **Node.js**, where each instance represents a bank. The system allows account creation, deposits, withdrawals, balance checks, account removal, and interbank communication.

It follows a **TCP/IP server-client architecture**, where commands are sent as **UTF-8 encoded text** over a specified port (65525–65535). Commands must start with a **two-letter code**, and responses follow a strict format.


## 📜 Features

✔️ **Account Management** (Create, Deposit, Withdraw, Balance, Remove)  
✔️ **Interbank Transactions** (ν version)  
✔️ **Total Bank Balance & Number of Clients**  
✔️ **Configurable Settings** (port, timeout, IP)  
✔️ **Persistent Storage** (Accounts & Balances are not lost on restart)  
✔️ **Logging** (Tracks operations & interbank communications)  
✔️ **Error Handling** (Strict command validation &   meaningful error messages)

## 🚀 Installation & Setup

### **1️⃣ Prerequisites**

- **Node.js** (latest LTS version recommended)
- **Putty or Telnet**

### **2️⃣ Install Dependencies**

```sh
npm install
```

### **3️⃣ Configure the Server**

Edit the `.env` file to set the **port, timeout, and static IP** (if not dynamic).

### **4️⃣ Start the Server**

```sh
node bank.js
```

## 📡 Command Structure

| **Command** | **Description**                      | **Request Example**      | **Success Response** |
| ----------- | ------------------------------------ | ------------------------ | -------------------- |
| **BC**      | Get bank IP                          | `BC`                     | `BC 10.1.2.3`        |
| **AC**      | Create account                       | `AC`                     | `AC 10001/10.1.2.3`  |
| **AD**      | Deposit funds                        | `AD 10001/10.1.2.3 3000` | `AD`                 |
| **AW**      | Withdraw funds                       | `AW 10001/10.1.2.3 2000` | `AW`                 |
| **AB**      | Check balance                        | `AB 10001/10.1.2.3`      | `AB 2000`            |
| **AR**      | Remove account (only if balance = 0) | `AR 10001/10.1.2.3`      | `AR`                 |
| **BA**      | Total bank balance                   | `BA`                     | `BA 7001211`         |
| **BN**      | Number of accounts                   | `BN`                     | `BN 5`               |

> **Proxy Feature (ν version)**:  
> If a command (AD, AW, AB) contains a different bank IP, the request is forwarded to the correct bank, and the response is returned to the sender.

## 🛠 Configuration Options

**Located in `.env`:**
###### example:

```env
PORT=65525
TIMEOUT=5000
BANK_IP=10.1.2.3
```


## 📑 Logging

- **All operations** (valid & invalid commands) are logged.
- Logs track both **local transactions** and **interbank requests**.
- Logs are stored in `logs/transactions.log`.

## 📜 References & Code Reuse

1. **Sources Used**:

    - **ChatGPT** (Link to AI conversations with prompts)
    - **Node.js TCP Module Documentation**
    - **Previous projects** (e.g., REST API for authentication, WebSocket handling)
2. **Reused Code from Past Projects**:
    
    - Persistent storage handling from the **blog project**
    - TCP client/server setup from **real-time chat project**
    - Logging system reused & extended

