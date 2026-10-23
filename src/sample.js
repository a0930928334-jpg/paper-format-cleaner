// 演示用的 AI 论文文本：结构完整，覆盖封面信息、摘要、标题、表格、公式和参考文献
export const SAMPLE_TEXT = `学校：浙江工商大学
论文题目：基于人工智能的论文自动排版系统研究
英文题目：Research on Automatic Paper Formatting System Based on Artificial Intelligence
专业：软件工程
班级：软工2201
学号：2022000001
姓名：张三
日期：二○二六年四月

摘要
随着生成式人工智能技术的快速发展，越来越多的学生开始借助人工智能工具完成论文写作。人工智能能够显著提升论文初稿生成效率，但在实际使用过程中，AI生成文本在复制到Word或WPS后经常出现标题层级混乱、段落缩进异常、项目符号残留、目录无法自动生成以及参考文献编号不统一等问题。本文设计并实现了一种基于规则识别与Word自动生成技术的论文自动排版系统。

关键词：人工智能；论文排版；格式清洗；Word自动生成；结构识别

Abstract
With the rapid development of generative artificial intelligence, more students begin to use AI tools to complete academic writing. This paper designs and implements an automatic paper formatting system based on rule recognition and Word document generation.

Keywords: Artificial Intelligence; Paper Formatting; Text Cleaning; Word Generation

一 引言
近年来，人工智能技术在文本生成、资料整理和学术写作等场景中得到了广泛应用。许多学生会使用AI工具生成论文初稿，再将文本复制到Word文档中进行修改。

二 文献综述
（一）AI写作工具研究
现有AI写作工具主要关注内容生成质量，例如文本流畅度、逻辑完整性和语言表达准确性。

（二）文档自动排版研究
文档自动排版通常依赖模板引擎或结构化文档转换技术。

三 系统设计
（一）文本清洗模块
文本清洗模块主要负责处理原始输入中的噪声内容，包括多余空行、全角空格、项目符号和不统一的编号格式。

（二）结构识别模块
系统通过规则识别论文题目、摘要、关键词、章节标题和参考文献。

表1 系统模块说明
| 模块 | 功能 |
| 文本清洗模块 | 清理多余空格和符号 |
| 结构识别模块 | 识别标题、摘要和参考文献 |
| Word生成模块 | 生成最终论文文档 |

四 系统实现
系统前端采用React实现，用户可以在左侧输入框中粘贴AI生成的论文文本，右侧实时预览清洗后的结果。

公式：y = ax + b

图1 系统整体流程示意图

五 结论
本文设计并实现了一种面向AI生成文本的论文自动排版系统。测试结果表明，该系统能够有效降低论文排版中的重复劳动。

参考文献
张三，2020，《人工智能导论》，北京：某出版社。
李四，2021，《自然语言处理技术研究》，上海：某大学出版社。
王五，2022，《文档自动排版方法研究》，《计算机应用研究》第5期，第66-72页。`;
