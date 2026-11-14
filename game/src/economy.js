// Shared shop prices and the player's available cash.
export const PRICES = {
  Pistol: 300,
  SMG: 1500,
  Rifle: 2700,
  Sniper: 4750,
  Kevlar: 650,
  'Defuse kit': 400,
  Smoke: 300,
  Flash: 350,
};

export function createEconomy() {
  return {
    money: 800,
    buy(name) {
      const price = PRICES[name];
      if (price === undefined || this.money < price) return false;
      this.money -= price;
      return true;
    },
  };
}
