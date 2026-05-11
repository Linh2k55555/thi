export async function sendExamResult(data) {
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
      
      const pickedText = 
        picked !== null && picked !== undefined
          ? q.choices[picked]
          : "Không trả lời";
      
      const correctText = q.choices[q.correct];
      
      const isCorrect = picked === q.correct;
      
      return `**Câu ${i + 1}:** ${q.q}

📌 **Trả lời:** ${
        picked !== undefined 
          ? `${String.fromCharCode(65 + picked)}. ${pickedText}` 
          : "❓ Không trả lời"
      }

✅ **Đáp án đúng:** ${String.fromCharCode(65 + q.correct)}. ${correctText}

${isCorrect ? "🟢 ĐÚNG" : "🔴 SAI"}
━━━━━━━━━━━━━━━━━━━━`;
    })
    .join("\n\n");

  // Tạo embed cho Discord
  const embed = {
    title: "📝 KẾT QUẢ BÀI THI FTO",
    color: pass === "ĐẬU" ? 0x22c55e : 0xef4444,
    fields: [
      {
        name: "👤 Thí sinh",
        value: `\`\`\`${name}\`\`\``,
        inline: true
      },
      {
        name: "📊 Điểm",
        value: `\`\`\`${score}/${total}\`\`\``,
        inline: true
      },
      {
        name: "📌 Kết quả",
        value: pass === "ĐẬU" 
          ? "```diff\n+ ĐẬU```" 
          : "```diff\n- RỚT```",
        inline: true
      }
    ],
    description: formattedQuestions.slice(0, 4000), // Discord giới hạn 4096 ký tự
    timestamp: new Date().toISOString(),
    footer: {
      text: "Hệ thống thi FTO • LSPD"
    }
  };

  // Thêm phần tự luận nếu có
  if (essay && essay !== "Không có") {
    embed.fields.push({
      name: "📝 Bài tự luận",
      value: essay.length > 1000 
        ? essay.slice(0, 997) + "..." 
        : essay,
      inline: false
    });
  }

  // Gửi webhook
  const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "FTO Exam System",
      avatar_url: "https://i.imgur.com/AfFp7pu.png", // Có thể thay đổi icon
      embeds: [embed]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
  }

  return true;
}
