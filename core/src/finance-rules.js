function deriveFinanceFromCreditRating(creditRating) {
  if (creditRating <= 0) {
    return { level: "penniless", cash: 0.5, assets: 0, spendingLevel: 0.5 };
  }
  if (creditRating <= 9) {
    return { level: "poor", cash: creditRating * 1, assets: creditRating * 10, spendingLevel: 2 };
  }
  if (creditRating <= 49) {
    return { level: "average", cash: creditRating * 2, assets: creditRating * 50, spendingLevel: 10 };
  }
  if (creditRating <= 89) {
    return { level: "wealthy", cash: creditRating * 5, assets: creditRating * 500, spendingLevel: 50 };
  }
  if (creditRating <= 98) {
    return { level: "rich", cash: creditRating * 20, assets: creditRating * 40000, spendingLevel: 5000 };
  }
  return { level: "super_rich", cash: 1000000, assets: 100000000, spendingLevel: 100000 };
}

module.exports = {
  deriveFinanceFromCreditRating
};