import prismaClient from "./src/shared/prisma";
import bcrypt from "bcryptjs";

async function main() {
  await prismaClient.refreshToken.deleteMany({});
  await prismaClient.profile.deleteMany({});
  await prismaClient.restaurant.deleteMany({});

  const restaurant = await prismaClient.restaurant.create({
    data: { name: "Test Restaurant", cnpj: "11222333000181" },
  });

  const hashed = await bcrypt.hash("password123", 10);
  const profile = await prismaClient.profile.create({
    data: {
      name: "Test",
      lastname: "Admin",
      email: "admin@test.com",
      password: hashed,
      restaurantId: restaurant.id,
      role: "ADMIN",
    },
  });

  console.log(JSON.stringify({ restaurantId: restaurant.id, profileId: profile.id }));
  process.exit(0);
}

main();
