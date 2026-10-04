import { Prisma } from "@prisma/client";
import { generateOrderNo } from "./encryption";

// Each callback must encompass the entire database transaction. External effects run afterwards.
export async function createWithOrderNumber<T>(create: (orderNo: string) => Promise<T>, prefix = ""): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(prefix + generateOrderNo());
    } catch (error) {
      const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" &&
        Array.isArray(error.meta?.target) && error.meta.target.includes("orderNo");
      if (!collision || attempt >= 2) throw error;
    }
  }
}
