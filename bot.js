// Load environment variables
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Initialize bot with token from environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log("Crypto Tracker Bot is running...");

// Store user data
const userData = {};

// Supported blockchain configurations
const chains = {
  ethereum: {
    name: "Ethereum",
    api: "https://api.etherscan.io/api",
    apiKey: process.env.ETHERSCAN_API_KEY,
    tokenId: "ethereum",
    decimals: 18,
  },
  bsc: {
    name: "Binance Smart Chain",
    api: "https://api.bscscan.com/api",
    apiKey: process.env.BSCSCAN_API_KEY,
    tokenId: "binancecoin",
    decimals: 18,
  },
  polygon: {
    name: "Polygon",
    api: "https://api.polygonscan.com/api",
    apiKey: process.env.POLYGONSCAN_API_KEY,
    tokenId: "matic-network",
    decimals: 18,
  },
  bitcoin: {
    name: "Bitcoin",
    api: "https://api.blockchair.com/bitcoin",
    tokenId: "bitcoin",
    decimals: 8,
  },
};

// Utility function to fetch wallet balances
async function getWalletBalance(wallet, chain) {
  const config = chains[chain];
  if (!config) return null;

  try {
    if (chain === "bitcoin") {
      const url = `${config.api}/dashboards/address/${wallet}`;
      const response = await axios.get(url);
      const balanceInSatoshis = response.data.data[wallet]?.address.balance || 0;
      return balanceInSatoshis / 10 ** config.decimals;
    } else {
      const url = `${config.api}?module=account&action=balance&address=${wallet}&tag=latest&apikey=${config.apiKey}`;
      const response = await axios.get(url);
      const balanceInWei = response.data.result;
      return balanceInWei / 10 ** config.decimals;
    }
  } catch (error) {
    console.error(`Error fetching ${config.name} balance:`, error.message);
    return null;
  }
}

// Utility function to fetch token prices
async function getTokenPrice(tokenId) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`;
    const response = await axios.get(url);
    return response.data[tokenId]?.usd || null;
  } catch (error) {
    console.error("Error fetching token price:", error.message);
    return null;
  }
}

// Utility function to send price alerts
async function sendPriceAlerts() {
  for (const chatId in userData) {
    const user = userData[chatId];
    if (!user.notifications || user.notifications.length === 0) continue;

    let message = "📈 Price Alerts:\n";
    for (const tokenId of user.notifications) {
      const price = await getTokenPrice(tokenId);
      if (price) {
        message += `${tokenId.toUpperCase()}: $${price}\n`;
      }
    }
    bot.sendMessage(chatId, message);
  }
}

// Bot Commands

// Welcome message
bot.onText(/\/start/, (msg) => {
  const welcomeMessage = `
Welcome to the Crypto Tracker Bot! 🚀
Track your wallets, monitor token prices, and stay updated on your portfolio.

Commands:
/help - View the list of commands
/addwallet - Add a wallet to track
/removewallet - Remove a wallet
/listwallets - List tracked wallets
/checkwallets - Check wallet balances
/gettokenprice - Fetch the price of a token
/subscribeprice - Subscribe to token price alerts
/unsubscribeprice - Unsubscribe from token price alerts
/portfolio - View your portfolio value
/clearwallets - Clear all tracked wallets
  `;
  bot.sendMessage(msg.chat.id, welcomeMessage);
});

// Help command
bot.onText(/\/help/, (msg) => {
  const helpMessage = `
Commands:
/start - Welcome message
/help - View the list of commands
/addwallet - Add a wallet to track
/removewallet - Remove a wallet
/listwallets - List tracked wallets
/checkwallets - Check wallet balances
/gettokenprice <token_id> - Fetch the price of a token
/subscribeprice <token_id> - Subscribe to token price alerts
/unsubscribeprice <token_id> - Unsubscribe from token price alerts
/portfolio - View your portfolio value
/clearwallets - Clear all tracked wallets
  `;
  bot.sendMessage(msg.chat.id, helpMessage);
});

// Add wallet
bot.onText(/\/addwallet/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Which chain? (ethereum, bsc, polygon, bitcoin)").then(() => {
    bot.once("message", (chainMsg) => {
      const chain = chainMsg.text.toLowerCase();
      if (!chains[chain]) {
        bot.sendMessage(chatId, "❌ Unsupported chain. Please try again.");
        return;
      }

      bot.sendMessage(chatId, "Enter your wallet address:").then(() => {
        bot.once("message", (walletMsg) => {
          const wallet = walletMsg.text;

          if (!userData[chatId]) {
            userData[chatId] = { wallets: {}, notifications: [] };
          }
          if (!userData[chatId].wallets[chain]) {
            userData[chatId].wallets[chain] = [];
          }

          if (userData[chatId].wallets[chain].includes(wallet)) {
            bot.sendMessage(chatId, "❌ Wallet already added.");
            return;
          }

          userData[chatId].wallets[chain].push(wallet);
          bot.sendMessage(chatId, `✅ Wallet added successfully to ${chains[chain].name}!`);
        });
      });
    });
  });
});

// List wallets
bot.onText(/\/listwallets/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData[chatId];
  if (!user || Object.keys(user.wallets).length === 0) {
    bot.sendMessage(chatId, "❌ No wallets found. Use /addwallet to track wallets.");
    return;
  }

  let message = "📜 Your tracked wallets:\n";
  for (const [chain, wallets] of Object.entries(user.wallets)) {
    message += `\nChain: ${chains[chain].name}\n`;
    wallets.forEach((wallet, index) => {
      message += `${index + 1}. ${wallet}\n`;
    });
  }

  bot.sendMessage(chatId, message);
});

// Check wallets
bot.onText(/\/checkwallets/, async (msg) => {
  const chatId = msg.chat.id;
  const user = userData[chatId];
  if (!user || Object.keys(user.wallets).length === 0) {
    bot.sendMessage(chatId, "❌ No wallets found. Use /addwallet to track wallets.");
    return;
  }

  let message = "📊 Wallet Balances:\n";
  for (const [chain, wallets] of Object.entries(user.wallets)) {
    const tokenPrice = await getTokenPrice(chains[chain].tokenId);

    for (const wallet of wallets) {
      const balance = await getWalletBalance(wallet, chain);
      const valueInUSD = balance ? balance * tokenPrice : 0;
      message += `Chain: ${chains[chain].name}\nWallet: ${wallet}\nBalance: ${balance?.toFixed(8) || "N/A"}\nValue: $${valueInUSD.toFixed(2)}\n\n`;
    }
  }

  bot.sendMessage(chatId, message);
});

// Subscribe to token price alerts
bot.onText(/\/subscribeprice (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenId = match[1].toLowerCase();

  if (!chains[tokenId] && !(await getTokenPrice(tokenId))) {
    bot.sendMessage(chatId, "❌ Invalid token. Make sure the token exists on CoinGecko.");
    return;
  }

  if (!userData[chatId]) {
    userData[chatId] = { wallets: {}, notifications: [] };
  }

  if (userData[chatId].notifications.includes(tokenId)) {
    bot.sendMessage(chatId, `❌ You are already subscribed to ${tokenId} price alerts.`);
    return;
  }

  userData[chatId].notifications.push(tokenId);
  bot.sendMessage(chatId, `✅ Subscribed to ${tokenId.toUpperCase()} price alerts!`);
});

// Unsubscribe from token price alerts
bot.onText(/\/unsubscribeprice (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const tokenId = match[1].toLowerCase();

  if (!userData[chatId] || !userData[chatId].notifications.includes(tokenId)) {
    bot.sendMessage(chatId, "❌ You are not subscribed to this token's price alerts.");
    return;
  }

  userData[chatId].notifications = userData[chatId].notifications.filter((id) => id !== tokenId);
  bot.sendMessage(chatId, `✅ Unsubscribed from ${tokenId.toUpperCase()} price alerts.`);
});

// Portfolio command
bot.onText(/\/portfolio/, async (msg) => {
  const chatId = msg.chat.id;
  const user = userData[chatId];
  if (!user || Object.keys(user.wallets).length === 0) {
    bot.sendMessage(chatId, "❌ No wallets found. Use /addwallet to track wallets.");
    return;
  }

  let portfolioValue = 0;
  let message = "💼 Your Portfolio Value:\n";

  for (const [chain, wallets] of Object.entries(user.wallets)) {
    const tokenPrice = await getTokenPrice(chains[chain].tokenId);

    for (const wallet of wallets) {
      const balance = await getWalletBalance(wallet, chain);
      const valueInUSD = balance ? balance * tokenPrice : 0;
      portfolioValue += valueInUSD;
      message += `Chain: ${chains[chain].name} Wallet: ${wallet} Value: $${valueInUSD.toFixed(2)}\n`;
    }
  }

  message += `\nTotal Portfolio Value: $${portfolioValue.toFixed(2)}`;
  bot.sendMessage(chatId, message);
});

// Clear all wallets
bot.onText(/\/clearwallets/, (msg) => {
  const chatId = msg.chat.id;
  if (userData[chatId]) {
    userData[chatId].wallets = {};
    bot.sendMessage(chatId, "✅ All tracked wallets cleared.");
  } else {
    bot.sendMessage(chatId, "❌ No wallets to clear.");
  }
});
