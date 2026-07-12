# 循证审计（EVIDENCE.md）

> 依据 2026-07-11 定下的铁律（"专业设计点不许拍脑袋，先查临床怎么做"），对本产品**已实现功能**和**已定案待实施功能**做的全面证据审查。
> 每条标注四种判定之一：**✅ 有据** / **🟡 部分有据（方向有据、细节自建）** / **⚠️ 无据待补** / **❌ 曾违背证据（已修正或排期修正）**。
> 审计人：Claude；裁决人：作者。本文档随功能演进持续更新。

---

## 一、已实现功能审查

### 1. 倾诉先行，情绪接住后才进入分析 — ✅ 有据
先让用户宣泄和被共情、再进入理性分析的顺序，与情感标注（affect labeling）研究一致：把情绪说出来、被准确命名，本身就能降低情绪唤起强度；抑制学习模型也把情感标注列为暴露优化策略之一。
- [Maximizing Exposure Therapy: An Inhibitory Learning Approach（Craske et al., 2014，情感标注为优化策略之一）](https://pmc.ncbi.nlm.nih.gov/articles/PMC4114726/)
- [Inhibitory Learning in Exposure Therapy for Social Anxiety（含 affect labeling 应用）](https://nationalsocialanxietycenter.com/research-summaries/inhibitory-learning-in-exposure-therapy-for-social-anxiety-and-other-anxiety-related-disorders/)

### 2. SUDs 主观紧张度评分（0-10 滑条） — ✅ 量表有据，❌ 时机曾错（已定案修正）
SUDs 是暴露疗法的标准测量（临床用 0-100，教科书记录单练前练后都测）。但我们最初放在"进模拟之前"测——临床实际是在**暴露进行中**反复测。已定案改为"遭遇瞬间测"（D16）。
- [Exposure Practice Worksheet（Abramowitz 等教科书配套记录单原件）](https://www.eugeneanxiety.com/wp-content/uploads/2022/01/1ExposurePracticeWorksheet.pdf)
- [临床试验协议：暴露中 SUDs 降半或 45 分钟为一节](https://cdn.clinicaltrials.gov/large-docs/24/NCT04048824/Prot_SAP_ICF_000.pdf)

### 3. 练后自报滑条 — ❌ 曾违背证据（已定案删除）
"单次练习内紧张度下降"与疗效几乎无预测关系（抑制学习模型的核心发现），练后再拖一个数字既测不准也不重要。已定案删除，改为教科书三问的对话式对账（D16）。
- [Craske et al., 2014（within-session habituation 非必要）](https://pmc.ncbi.nlm.nih.gov/articles/PMC4114726/)

### 4. 恐惧阶梯与难度推荐 — 🟡 分级暴露有据，❌ 强制爬梯曾违背证据（已定案修正）
分级暴露本身是标准做法，但两点被证据打脸：① 经典协议起点是**中等强度**（SUDS 50-60），不是最温和级；② 强度可变（甚至随机）的暴露比严格从低到高学得更牢。已定案改为自由选+推荐角标（D18）。
- [临床协议：从 SUDS 50-60 起步](https://cdn.clinicaltrials.gov/large-docs/24/NCT04048824/Prot_SAP_ICF_000.pdf)
- [Enhancing Inhibitory Learning: The Utility of Variability in Exposure](https://pmc.ncbi.nlm.nih.gov/articles/PMC6884337/)

### 5. 脱敏状态机（"练满 3 次且紧张度降幅 ≥40%"判定已脱敏） — ❌ 违背当前证据（排期修正，套件五）
该规则是纯习惯化逻辑，恰是被抑制学习模型推翻的判据。已定案改为多信号判定：遭遇瞬间 SUDs 跨次走低＋预期违背记录＋行为指标（D17）。**这是当前已实现代码中最需要修的一处。**
- [Craske et al., 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4114726/)

### 6. 灾难化想象四步流程（捕捉→客观概率→"万一"与 Plan B→最坏模拟） — ✅ 有据，含一处已核实的流派张力
- 四步结构与 CBT 经典"去灾难化"技术一致（识别最坏想象→评估真实概率→评估应对能力），最坏情况模拟对应想象暴露。
- **张力点（已专门核查）**：抑制学习模型理论上主张"暴露前不做认知安抚"，以免提前削弱预期、损失预期违背的学习量。但 2022 年随机对照试验（幽闭恐惧样本）直接检验了"认知重建放在暴露前 vs 暴露后"，结果**两组疗效相同**——顺序不影响结局。结论：保留现有顺序（先降概率再模拟），它同时服务知情同意与安全原则（D27）。
- [Cognitive Restructuring Before Versus After Exposure: Effect on Expectancy and Outcome（Krause, Koerner & Antony, 2022）](https://journals.sagepub.com/doi/10.1177/01454455221075754)
- [Cognitive restructuring before exposure or behavioral experiments?（2025，时机与预期变化量研究）](https://pubmed.ncbi.nlm.nih.gov/40354272/)
- ⚠️ 去灾难化技术本身的一手出处（Beck 认知疗法体系）本次未单独核源，列为待补引用。

### 7. 模拟对手（AI 角色扮演真实冲突对象） — ✅ 有据
角色扮演/行为排演是社交焦虑治疗的标准手段：治疗师扮演刁难者，来访者以本人身份应对，"演得像真的一样"；虚拟对象同样有效（VR 文献）。
- [Role-Playing 综述（ScienceDirect Topics）](https://www.sciencedirect.com/topics/psychology/role-playing)
- [VR 暴露治疗社交焦虑综述](https://pmc.ncbi.nlm.nih.gov/articles/PMC8913509/)

### 8. 练后复盘（识别话术、亮点、改进建议） — ✅ 结构有据
教科书记录单的练后处理就是结构化复盘（发生了什么/与预期差异/学到什么）；行为排演后给反馈是社交技能训练的标准环节。已定案将交付方式改为对话式、用户表达优先（D16）。
- [Exposure Practice Worksheet](https://www.eugeneanxiety.com/wp-content/uploads/2022/01/1ExposurePracticeWorksheet.pdf)
- [行为实验工作单标准结构（预测→结果→所学）](https://www.psychologytools.com/resource/behavioral-experiment)

### 9. "我做到了"现实应用标记 — ✅ 有据
暴露疗法的疗效落点就是"在真实生活中做到"：诊室练习配合真实情境的家庭作业是标准结构；记录并强化现实应用与之同构。
- [Prolonged Exposure Protocol（含 in vivo 家庭作业结构）](https://depts.washington.edu/uwhatc/PDF/TF-%20CBT/pages/6%20Cognitive%20coping%20and%20processing/Therapist%20Materials/PE%20Protocol%20with%20details.pdf)

### 10. 成长轨迹页（跨次进步可视化） — ✅ 有据
临床本来就做跨次追踪：治疗师检查"SUDS 峰值是否逐次下降、是否在爬阶梯"，据此调整方案。产品化为可视曲线与之同构。待实施的行为指标曲线（D17）依据见第二部分。
- [Exposure Therapy: Principles, Protocols & Evidence（跨次监测段落）](https://www.cogn-iq.org/learn/theory/exposure-therapy/)

### 11. 危机安全护栏（检测自伤倾向即跳出角色转介） — 🟡 常识级正确，待专业规范补强
数字心理健康产品设危机转介是行业通行安全实践；具体触发词表和转介文案未经专业审核，按 D27-5 上线前须专业团队过目。

### 12. 倒计时时间压力（含超时催促） — ✅ 方向有据，参数为产品决定
时间压力有明确生理效应（心率、激素反应），作为社会评价情境的压力源与 TSST 的"限时任务"结构一致。时长 30 秒 vs 60 秒无临床对应参数，属作者设计决定（原始设计 30 秒，已定案恢复）。
- [Perceived time pressure impacts executive function and stress](https://www.sciencedirect.com/science/article/pii/S0001691822002177)
- [TSST 原理与实践](https://pmc.ncbi.nlm.nih.gov/articles/PMC5314443/)

### 13. 话术固定词表（5 大类 25 种） — 🟡 部分有据（形式有据，分类自建）
"教用户识别对方的操纵手法"属于心理教育（psychoeducation），是 CBT 标准组件；固定词表保证跨事件聚合是工程决定，无碍专业性。但 **25 种的具体分类是自建整合，不是经过验证的临床分类体系**——学界并无统一的"操纵话术分类量表"。按 D27-5，上线前须专业团队审核该词表。
- ⚠️ 心理教育有效性的一手引用本次未单独核源，列为待补。

---

## 二、已定案待实施功能审查（D14-D29）

### 14. 小助手实时看战况＋硬规则（D14） — ✅ 有据
治疗师在角色扮演中本来就是全程在场的观察者兼教练；"每条回复须点破具体套路或给可执行话术"对应行为排演中的具体化反馈原则。
- [Role-Playing 综述](https://www.sciencedirect.com/topics/psychology/role-playing)

### 15. 对话式教学替代静态分析页（D15） — ✅ 有据
心理教育以对话/引导发现（guided discovery）方式交付是 CBT 会谈的标准形态；一次性灌输长文档不是。
- [行为实验工作单（治疗师逐步引导的结构示例）](https://www.psychologytools.com/resource/behavioral-experiment)

### 16. 遭遇瞬间测 SUDs＋教科书三问对账（D16） — ✅ 有据
见第 2、8 条。三问原文照搬教科书记录单（发生了什么/与预期有何不同/学到什么），交付方式（用户表达优先）为作者的产品决定，与"来访者中心"原则一致。

### 17. 脱敏多信号判定＋行为指标（D17） — ✅ 有据
三路证据对应三个临床构念：
- **回避/接近**：行为回避测验（BAT）测"敢不敢进入、待多久、是否中途逃离"，跨次重复测量看进步。**但作者指出（2026-07-11）：App 不是诊室的受控环境**——中途退出和卡片不练可能是有事/嫌麻烦/本就不需要练，直接推断为回避会污染数据。临床同样禁止这种推断：作业未完成时治疗师须以不评判的方式探讨原因，研究证实未完成的首要原因是外部因素与动机，而非回避。**修正**：这两项从判定输入中剔除；仅当"差异化模式"出现（同一用户别的卡正常练、唯独某卡反复点开秒退）才作为观察信号，且由边牧不评判地询问确认动机——行为可记录，动机不推断，要知道动机就问。同时提供"这张不需要练"归档选项（用户有权宣布某场景不值得练，D28）。留在判定内的机械指标仅剩模拟内部三项（回复用时、字数、求助次数）。
- **安全行为**：SBQ/SAFE 量表的条目直接适用于对话情境（说得很少、避免提问、避免谈自己、字斟句酌；印象管理：反复找补、努力装正常）→ 对应 AI 按固定类目识别文本行为＋回复用时/字数。
- **预期违背**："担心的事没发生/发生了但承受住了"的记录 → 对应对账日志。
- [BAT 与治疗效果关联研究](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9231550/)
- [安全行为两亚型研究（SBQ 条目）— PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0223165)
- [SAFE 量表](https://www.sciencedirect.com/science/article/abs/pii/S0887618509001145)
- [Buchholz et al., 2022：暴露中预期违背的 RCT](https://jonabram.web.unc.edu/wp-content/uploads/sites/2968/2022/04/Buchholz-et-al.-2022-Expectancy-violation-during-exposure-RCT.pdf)
- [CBT 作业未完成的障碍研究（外部因素与动机为首要原因，须探讨不许推断）](https://pmc.ncbi.nlm.nih.gov/articles/PMC3774296/)
- [作业问题在 CBT 中的发生率与处理](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/0C47B89190ED53495A5223D38216B45A/S1352465804001365a.pdf/problems_with_homework_in_cbt_rare_exception_or_rather_frequent.pdf)

### 18. 难度自由选＋推荐角标（D18） — ✅ 有据
见第 4 条（变化性优于严格爬梯）；"用户自主+专业建议"符合 D28 总纲。

### 19. 沉浸感强化：30 秒倒计时、闪烁、微信化界面（D19） — ✅ 方向有据
- 临场感（presence）比画面逼真度更决定 VR 暴露疗效；低保真环境同样有效；社交线索的操纵（对方反应、时间压力）是紧张度的把手 → 聊天界面复刻＋倒计时压迫方向正确。
- 红色是"危险"的通用认知编码；闪烁/泛红用于末段警示有据。光敏风险按 D27-6 三层制处理。
- [VR 暴露治疗社交焦虑综述（低保真有效、临场感关键）](https://pmc.ncbi.nlm.nih.gov/articles/PMC8913509/)
- [虚拟社交互动中的临场感与焦虑](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3994638/)
- [警示信息情境中的颜色唤起效应](https://link.springer.com/chapter/10.1007/978-3-319-39399-5_10)

### 20. 自我认知五层定位＋情绪词表胶囊（D20） — ✅ 有据
情感标注研究：准确命名情绪本身降低情绪强度（见第 1 条引用）。五层分类（不知何情绪/不知来源/不知想要什么/不知怎么做/不敢做）为作者的产品架构，与临床"个案概念化先于干预"的逻辑一致；具体分层无现成临床分类对应，属 🟡 自建但不违背证据。

### 21. 压迫特效四支柱（D24） — ✅ 有据
- 社会评价威胁＋不可控性缺一不可（皮质醇效应量 d=.93 vs <.02）→ 高难度对手"油盐不进"。
- 不可预测威胁诱发持续性焦虑（NPU 范式）→ 节奏不规律。
- 逼近中的威胁更激发焦虑且抗习惯化（逼近易感性模型）→ "逼近"式特效语法。
- [TSST 原理与实践（Dickerson & Kemeny 元分析结论）](https://pmc.ncbi.nlm.nih.gov/articles/PMC5314443/)
- [NPU 威胁测试 — Nature Protocols](https://www.nature.com/articles/nprot.2012.001)
- [逼近易感性模型综述（2024）](https://link.springer.com/article/10.1007/s10608-024-10481-1)

### 22. 微信截图作底图（D22） — 🟡 方向有据（推理性应用）
临场感文献支持"环境越贴近真实战场激活越强"；抑制学习模型的"检索线索/多情境"策略支持使用真实素材。但"截图作底图"这一具体做法无直接研究——属于有依据方向上的产品创新，标注为推理性应用。
- [Craske et al., 2014（retrieval cues / multiple contexts）](https://pmc.ncbi.nlm.nih.gov/articles/PMC4114726/)

### 23. 边牧小助手（D25） — 🟡 情感化设计，不违背证据
陪伴形象在倾诉/教学阶段提供情感支持、不进入模拟战场——恰好符合"暴露时撤除安全信号"的要求（若狗全程陪同模拟，反而违背证据）。动物形象本身属产品设计，无需临床依据。
- [Craske et al., 2014（removal of safety signals）](https://pmc.ncbi.nlm.nih.gov/articles/PMC4114726/)

### 24. BGM 三段式（D26） — 平复侧 ✅ 已核实；紧张侧 ⚠️ 待核
- **平复侧（已核实）**：60-80/60-90 bpm 慢速音乐降低焦虑的效应经多项元分析证实（心率同步/节奏夹带机制；临床建议：无歌词、≤60 分贝）。
- **紧张侧（待核）**："不和谐音程制造不安、低频轰鸣诱发警觉"有文献传统，但本次未核到一手来源。按铁律标注：**实施前必须补核，或由作者裁决是否先用保守方案（模拟期仅静音/环境底噪）**。
- [音乐干预对压力相关结局的系统综述与元分析（60-90 bpm 效应量更大）](https://www.tandfonline.com/doi/full/10.1080/17437199.2019.1627897)
- [音乐治疗减压系统综述](https://www.tandfonline.com/doi/full/10.1080/17437199.2020.1846580)

### 25. 知情同意三层制（D27-6/7） — ✅ 有据
知情同意是临床伦理基石；数字产品中"默认关闭＋首次说明＋随时可改"是其标准落地形态。刺激性内容前置告知与临床暴露治疗"共同制定暴露计划"的原则一致（暴露内容永远是来访者知情同意的）。
- [Exposure Therapy: Principles, Protocols & Evidence（治疗联盟与协作设计段落）](https://www.cogn-iq.org/learn/theory/exposure-therapy/)

### 26. 可跳过＋可回来（D29） — ✅ 与证据一致
抑制学习模型明确：即使在高紧张时中止暴露也不毁掉学习（习惯化非必要）；来访者对流程的控制感本身降低脱落率。
- [Craske et al., 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4114726/)

---

## 三、诚实清单：无临床依据的自建参数（不违背证据，但属产品决定）

| 项目 | 性质 |
|---|---|
| 倒计时 30 秒时长、停手 3 秒恢复计时 | 工程参数。时间压力方向有据，具体秒数无临床对应 |
| 25 种话术的具体分类与命名 | 自建整合，上线前须专业审核（D27-5） |
| 特效的具体视觉形态（泛红、脉冲样式等） | 设计选型。"逼近语法"原则有据，具体样式是美术决定 |
| 自我认知五层的具体划分 | 作者产品架构，逻辑同"个案概念化"，无现成量表对应 |
| 紧张度"≤4 分算通过"旧阈值 | 已随 D17 废除 |

## 四、审计结论

- **曾违背证据、已定案修正**：练后自报滑条（删）、SUDs 门外测（挪至遭遇瞬间）、强制爬梯（改自由选）、静态教学页（改对话式）。
- **违背证据、代码里还活着**：脱敏状态机的习惯化判定规则——套件五第一优先修。
- **待补核后才可实施**：BGM 紧张侧音效的一手依据。
- **待补引用（不阻塞实施）**：去灾难化技术、心理教育有效性的一手出处。
- 其余各项：有据或属不违背证据的产品决定。

*本文档与 DECISIONS.md 配套：那边记"决定了什么、为什么"，这边记"证据是否撑得住"。*
