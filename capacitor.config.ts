import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "page.tata.app",
  appName: "Tata",
  webDir: "dist-web",
  ios: {
    contentInset: "never",
    backgroundColor: "#000000",
  },
};

export default config;
