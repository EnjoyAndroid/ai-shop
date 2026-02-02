import prisma from "@/lib/db";

// 简单的文本格式化：支持链接、加粗、高亮、颜色
function formatContent(content: string): React.ReactNode {
  // 匹配模式：[链接文字](URL)、**加粗**、==高亮==、{红色}、{绿色}、{蓝色}
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|==([^=]+)==|\{红色\}([^{]+)\{\/红色\}|\{绿色\}([^{]+)\{\/绿色\}|\{蓝色\}([^{]+)\{\/蓝色\}/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(content)) !== null) {
    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // 链接: [文字](URL)
      parts.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      // 加粗: **文字**
      parts.push(
        <strong key={key++} className="font-bold">
          {match[3]}
        </strong>
      );
    } else if (match[4]) {
      // 高亮: ==文字==
      parts.push(
        <span key={key++} className="bg-yellow-200 px-1 rounded">
          {match[4]}
        </span>
      );
    } else if (match[5]) {
      // 红色: {红色}文字{/红色}
      parts.push(
        <span key={key++} className="text-red-500">
          {match[5]}
        </span>
      );
    } else if (match[6]) {
      // 绿色: {绿色}文字{/绿色}
      parts.push(
        <span key={key++} className="text-green-500">
          {match[6]}
        </span>
      );
    } else if (match[7]) {
      // 蓝色: {蓝色}文字{/蓝色}
      parts.push(
        <span key={key++} className="text-blue-500">
          {match[7]}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // 添加剩余的普通文本
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

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
              <p className="text-sm text-gray-600 mt-1">{formatContent(announcement.content)}</p>
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
