import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The battle simulator and damage calculator are large Node packages full of Pokédex data. Loading them with plain Node `require` instead of bundling them keeps builds fast and avoids bundling problems.
  serverExternalPackages: ["@pkmn/sim", "@smogon/calc"],
};

export default nextConfig;