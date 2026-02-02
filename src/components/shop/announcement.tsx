import prisma from "@/lib/db";

// 验证 URL 是否安全（仅允许 http/https 协议）
function isSafeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url, "https://example.com");
    return ["http:", "https:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

// 简单的文本格式化：支持链接、加粗、高亮、颜色（可嵌套组合）
function formatContent(content: string): React.ReactNode {
  // 递归处理所有格式
  const processText = (text: string, keyPrefix: string = ""): React.ReactNode => {
    // 匹配：[链接](URL)、**加粗**、==高亮==、{颜色}...{/颜色}
    const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([\s\S]*?)\*\*|==([\s\S]*?)==|\{(红色|绿色|蓝色)\}([\s\S]*?)\{\/\5\}/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      if (match[1] && match[2]) {
        // 链接: [文字](URL) - 验证 URL 安全性
        const url = match[2];
        if (isSafeUrl(url)) {
          parts.push(
            <a
              key={`${keyPrefix}-link-${key++}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              {processText(match[1], `${keyPrefix}-l${key}`)}
            </a>
          );
        } else {
          // 不安全的 URL，仅显示文本
          parts.push(
            <span key={`${keyPrefix}-text-${key++}`}>
              {processText(match[1], `${keyPrefix}-t${key}`)}
            </span>
          );
        }
      } else if (match[3] !== undefined) {
        // 加粗: **文字**
        parts.push(
          <strong key={`${keyPrefix}-bold-${key++}`} className="font-bold">
            {processText(match[3], `${keyPrefix}-b${key}`)}
          </strong>
        );
      } else if (match[4] !== undefined) {
        // 高亮: ==文字==
        parts.push(
          <span key={`${keyPrefix}-mark-${key++}`} className="bg-yellow-200 px-1 rounded">
            {processText(match[4], `${keyPrefix}-m${key}`)}
          </span>
        );
      } else if (match[5] && match[6] !== undefined) {
        // 颜色: {红色}文字{/红色}
        const color = match[5];
        const colorClass = color === "红色" ? "text-red-500" : color === "绿色" ? "text-green-500" : "text-blue-500";
        parts.push(
          <span key={`${keyPrefix}-color-${key++}`} className={colorClass}>
            {processText(match[6], `${keyPrefix}-c${key}`)}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return processText(content);
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
              <h4 className="font-semibold text-gray-800 text-lg">{announcement.title}</h4>
              <p className="text-base text-gray-600 mt-1">{formatContent(announcement.content)}</p>
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
