export const lazyBlock = {
  type: "lazy",
  loader: async () => {
    const { localePath } = await import("@/lib/locale");
    return localePath("/");
  },
};
