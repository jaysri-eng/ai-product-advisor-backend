import { v4 as uuidv4 } from "uuid";

const fallbackScore = (query, product) => {
  const q = query.toLowerCase().split(/\s+/).filter(w => w.length > 2); // ignore very short words
  const name = product.product_name.toLowerCase();
  const category = product.category.toLowerCase();
  const description = product.description.toLowerCase();
  const brand = product.brand.toLowerCase();

  let score = 0;
  q.forEach(word => {
    if (name.includes(word)) score += 40;       // strong match
    else if (category.includes(word)) score += 30;
    else if (description.includes(word)) score += 20;
    else if (brand.includes(word)) score += 10;
  });

  if (product.price < 5000) score += 5; // small bias for affordability
  return score;
}

const applyFallbackScore = (query, items) => {
  return items.map(item => ({
    ...item,
    score: fallbackScore(query, item.product),
    uid: uuidv4(),   //unique id for each response/item
  }));
}

export default applyFallbackScore