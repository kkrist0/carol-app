export const storage = {
  async get(key) {
    const v = localStorage.getItem("C.A.R.O.L._" + key);
    if (v === null) throw new Error("not found");
    return { key, value: v };
  },
  async set(key, value) { 
    localStorage.setItem("C.A.R.O.L._" + key, value); 
    return { key, value }; 
  },
  async delete(key) { 
    localStorage.removeItem("C.A.R.O.L._" + key); 
    return { key, deleted: true }; 
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith("C.A.R.O.L._" + prefix)) keys.push(k.slice(7));
    }
    return { keys };
  },
};