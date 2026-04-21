/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/api/actions/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization,Content-Encoding,Accept-Encoding" },
          { key: "Access-Control-Expose-Headers", value: "X-Action-Version,X-Blockchain-Ids" },
        ],
      },
    ];
  },
};

export default nextConfig;
