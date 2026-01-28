import prisma from "@/lib/db";

export async function Announcement() {
  // 构建时跳过数据库查询
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.includes("@")) {
    return null;
  }

  try {
    const announcements = await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: [{ isPinned: "desc" }, { sort: "asc" }, { createdAt: "desc" }],
      take: 3,
    });

    if (announcements.length === 0) {
      return null;
    }

    return (
      <div className="mb-6 space-y-2">
        {announcements.map((announcement) => (
          <div
            key={announcement.id}
            className={`p-4 rounded-lg flex items-start gap-3 ${
              announcement.type === "warning"
                ? "bg-yellow-50 border border-yellow-200"
                : announcement.type === "success"
                ? "bg-green-50 border border-green-200"
                : "bg-blue-50 border border-blue-200"
            }`}
          >
            <span className="text-lg">
              {announcement.type === "warning"
                ? "⚠️"
                : announcement.type === "success"
                ? "✅"
                : "📢"}
            </span>
            <div>
              <h4 className="font-semibold text-gray-800">{announcement.title}</h4>
              <p className="text-sm text-gray-600 mt-1">{announcement.content}</p>
            </div>
          </div>
        ))}
      </div>
    );
  } catch (error) {
    // 构建时或数据库不可用时返回空
    console.error("Announcement fetch error:", error);
    return null;
  }
}
