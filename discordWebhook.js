// discordWebhook.js
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sendExamResult(data, retryCount = 0) {
  const MAX_RETRIES = 5;
  const BASE_DELAY = 1000; // 1 giây

  const {
    name,
    score,
    total,
    pass,
    questions,
    answers,
    essay
  } = data;

  // Format câu hỏi trắc nghiệm
  const formattedQuestions = questions
    .map((q, i) => {
      const picked = answers[i];
      const pickedText = picked !== null && picked !== undefined ? q.choices[picked] : "Không trả lời";
      const correctText = q.choices[q.correct];
      const isCorrect = picked === q.correct;
      return `**Câu ${i + 1}:** ${q.q}\n\n📌 **Trả lời:** ${
        picked !== undefined ? `${String.fromCharCode(65 + picked)}. ${pickedText}` : "❓ Không trả lời"
      }\n\n✅ **Đáp án đúng:** ${String.fromCharCode(65 + q.correct)}. ${correctText}\n\n${isCorrect ? "🟢 ĐÚNG" : "🔴 SAI"}\n━━━━━━━━━━━━━━━━━━━━`;
    })
    .join("\n\n");

  const embed = {
    title: "📝 KẾT QUẢ BÀI THI FTO",
    color: pass === "ĐẬU" ? 0x22c55e : 0xef4444,
    fields: [
      { name: "👤 Thí sinh", value: `\`\`\`${name}\`\`\``, inline: true },
      { name: "📊 Điểm", value: `\`\`\`${score}/${total}\`\`\``, inline: true },
      { name: "📌 Kết quả", value: pass === "ĐẬU" ? "```diff\n+ ĐẬU```" : "```diff\n- RỚT```", inline: true }
    ],
    description: formattedQuestions.slice(0, 4000),
    timestamp: new Date().toISOString(),
    footer: { text: "Hệ thống thi FTO • LSPD" }
  };

  if (essay && essay !== "Không có") {
    embed.fields.push({
      name: "📝 Bài tự luận",
      value: essay.length > 1000 ? essay.slice(0, 997) + "..." : essay,
      inline: false
    });
  }

  const payload = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "FTO Exam System",
      avatar_url: "https://i.imgur.com/AfFp7pu.png",
      embeds: [embed]
    })
  };

  try {
    const response = await fetch(process.env.DISCORD_WEBHOOK_URL, payload);

    if (response.ok) return true;

    // Xử lý rate limit (429)
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      let waitTime = BASE_DELAY * Math.pow(2, retryCount); // exponential backoff mặc định

      if (retryAfter) {
        // Discord trả về Retry-After dạng số giây (có thể là float)
        waitTime = parseFloat(retryAfter) * 1000;
      }

      if (retryCount < MAX_RETRIES) {
        console.warn(`⚠️ Rate limit (429). Retry in ${waitTime / 1000}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await delay(waitTime);
        return sendExamResult(data, retryCount + 1);
      } else {
        throw new Error(`Exceeded max retries (${MAX_RETRIES}) for Discord webhook`);
      }
    }

    // Các lỗi khác (4xx, 5xx không phải 429)
    const errorText = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
  } catch (err) {
    // Lỗi network hoặc lỗi khác cũng có thể retry (nên giới hạn số lần)
    if (retryCount < MAX_RETRIES && err.message !== "Exceeded max retries for Discord webhook") {
      const waitTime = BASE_DELAY * Math.pow(2, retryCount);
      console.warn(`⚠️ Lỗi: ${err.message}. Retry sau ${waitTime / 1000}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await delay(waitTime);
      return sendExamResult(data, retryCount + 1);
    }
    throw err;
  }
}
