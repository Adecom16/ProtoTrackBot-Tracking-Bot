require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Initialize bot
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("Bot is running...");

// Store user wallets
const userWallets = {};

/**
 * Fetch the ETH wallet balance for a given address.
 * @param {string} wallet - The wallet address.
 * @returns {number|null} - The wallet balance in ETH or null if an error occurs.
 */
async function getWalletBalance(wallet) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  const url = `https://api.etherscan.io/api?module=account&action=balance&address=${wallet}&tag=latest&apikey=${apiKey}`;
  
  try {
    const response = await axios.get(url);
    const balanceInWei = response.data.result;
    return balanceInWei / 1e18; // Convert Wei to ETH
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    return null;
  }
}

/**
 * Fetch the price of a token in USD using CoinGecko API.
 * @param {string} tokenId - The CoinGecko ID of the token.
 * @returns {number|null} - The token price in USD or null if an error occurs.
 */
async function getTokenPrice(tokenId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`;

  try {
    const response = await axios.get(url);
    return response.data[tokenId]?.usd || null;
  } catch (error) {
    console.error("Error fetching token price:", error);
    return null;
  }
}

// Commands

// /start: Welcome message
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Welcome to the Portfolio Tracker Bot!\n" +
    "Track your crypto wallets and token prices easily.\n" +
    "Use /help to see all available commands."
  );
});

// /help: List of commands and their descriptions
bot.onText(/\/help/, (msg) => {
  const helpMessage = `
Available Commands:
/start - Welcome message
/addwallet <wallet_address> - Add a wallet to track
/removewallet <wallet_address> - Remove a wallet from tracking
/listwallets - List all added wallets
/checkwallets - Check balances of all added wallets
/clearwallets - Remove all added wallets
/gettokenprice <token_id> - Get the price of a specific token (e.g., ethereum, bitcoin)
`;
  bot.sendMessage(msg.chat.id, helpMessage);
});

// /addwallet: Add a wallet to the tracking list
bot.onText(/\/addwallet (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const wallet = match[1];

  if (!userWallets[chatId]) {
    userWallets[chatId] = [];
  }
  if (userWallets[chatId].includes(wallet)) {
    bot.sendMessage(chatId, "Wallet already added!");
    return;
  }
  
  userWallets[chatId].push(wallet);
  bot.sendMessage(chatId, `Wallet ${wallet} added successfully.`);
});

// /removewallet: Remove a specific wallet from tracking
bot.onText(/\/removewallet (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const wallet = match[1];

  if (!userWallets[chatId] || !userWallets[chatId].includes(wallet)) {
    bot.sendMessage(chatId, "Wallet not found.");
    return;
  }

  userWallets[chatId] = userWallets[chatId].filter((w) => w !== wallet);
  bot.sendMessage(chatId, `Wallet ${wallet} removed successfully.`);
});

// /listwallets: List all added wallets
bot.onText(/\/listwallets/, (msg) => {
  const chatId = msg.chat.id;
  const wallets = userWallets[chatId];

  if (!wallets || wallets.length === 0) {
    bot.sendMessage(chatId, "You have no wallets added. Use /addwallet to add one.");
    return;
  }

  const message = "Your added wallets:\n" + wallets.join("\n");
  bot.sendMessage(chatId, message);
});

// /clearwallets: Clear all wallets
bot.onText(/\/clearwallets/, (msg) => {
  const chatId = msg.chat.id;

  if (!userWallets[chatId] || userWallets[chatId].length === 0) {
    bot.sendMessage(chatId, "You have no wallets to clear.");
    return;
  }

  userWallets[chatId] = [];
  bot.sendMessage(chatId, "All wallets cleared successfully.");
});

// /checkwallets: Check balances of all added wallets
bot.onText(/\/checkwallets/, async (msg) => {
  const chatId = msg.chat.id;
  const wallets = userWallets[chatId];

  if (!wallets || wallets.length === 0) {
    bot.sendMessage(chatId, "You have no wallets added. Use /addwallet to add one.");
    return;
  }

  const ethPrice = await getTokenPrice("ethereum");
  let message = "Wallet Balances:\n";

  for (const wallet of wallets) {
    const balance = await getWalletBalance(wallet);
    const valueInUSD = balance ? (balance * ethPrice).toFixed(2) : "N/A";
    message += `Wallet: ${wallet}\nBalance: ${balance ? balance.toFixed(4) + " ETH" : "Error fetching balance"}\nValue: $${valueInUSD}\n\n`;
  }

  bot.sendMessage(chatId, message);
});

// /gettokenprice: Get the price of a specific token
bot.onText(/\/gettokenprice (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenId = match[1].toLowerCase();

  const price = await getTokenPrice(tokenId);
  if (price) {
    bot.sendMessage(chatId, `The current price of ${tokenId} is $${price}`);
  } else {
    bot.sendMessage(chatId, `Error fetching price for token: ${tokenId}`);
  }
});
