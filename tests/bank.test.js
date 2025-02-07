const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
const mysql = require("mysql");
const net = require("net");
const { logInfo, logError } = require("../logger");
require("../src/config/dotenv.config");

describe("Bank Server", () => {
  let connection;
  let server;

  before((done) => {
    connection = mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    connection.connect((err) => {
      if (err) {
        logError("Error connecting to MySQL:", err.stack);
        return;
      }
      logInfo("Connected to MySQL as id " + connection.threadId);
      done();
    });

    server = require("../bank");
  });

  after((done) => {
    connection.end((err) => {
      if (err) {
        logError("Error disconnecting from MySQL:", err.stack);
        return;
      }
      logInfo("Disconnected from MySQL");
      done();
    });

    server.close();
  });

  it("should create a new bank account", (done) => {
    const client = new net.Socket();
    client.connect(process.env.PORT, "127.0.0.1", () => {
      client.write("AC\n");
    });

    client.on("data", (data) => {
      expect(data.toString()).to.match(/AC \d+\/127\.0\.0\.1\n/);
      client.destroy();
      done();
    });

    client.on("error", (err) => {
      logError("Client error:", err.message);
      client.destroy();
      done(err);
    });
  });

  it("should deposit money into an account", (done) => {
    const client = new net.Socket();
    client.connect(process.env.PORT, "127.0.0.1", () => {
      client.write("AD 12345/127.0.0.1 100\n");
    });

    client.on("data", (data) => {
      expect(data.toString()).to.equal("AD\n");
      client.destroy();
      done();
    });

    client.on("error", (err) => {
      logError("Client error:", err.message);
      client.destroy();
      done(err);
    });
  });

  it("should withdraw money from an account", (done) => {
    const client = new net.Socket();
    client.connect(process.env.PORT, "127.0.0.1", () => {
      client.write("AW 12345/127.0.0.1 50\n");
    });

    client.on("data", (data) => {
      expect(data.toString()).to.equal("AW\n");
      client.destroy();
      done();
    });

    client.on("error", (err) => {
      logError("Client error:", err.message);
      client.destroy();
      done(err);
    });
  });

  it("should check the balance of an account", (done) => {
    const client = new net.Socket();
    client.connect(process.env.PORT, "127.0.0.1", () => {
      client.write("AB 12345/127.0.0.1\n");
    });

    client.on("data", (data) => {
      expect(data.toString()).to.match(/AB 💸\d+💸\n/);
      client.destroy();
      done();
    });

    client.on("error", (err) => {
      logError("Client error:", err.message);
      client.destroy();
      done(err);
    });
  });

  it("should remove a bank account", (done) => {
    const client = new net.Socket();
    client.connect(process.env.PORT, "127.0.0.1", () => {
      client.write("AR 12345/127.0.0.1\n");
    });

    client.on("data", (data) => {
      expect(data.toString()).to.equal("AR\n");
      client.destroy();
      done();
    });

    client.on("error", (err) => {
      logError("Client error:", err.message);
      client.destroy();
      done(err);
    });
  });
});
