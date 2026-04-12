/**
 * AI艺术评分系统 - 传统色彩数字工坊
 * 支持读取全局变量 traditionalColors
 */

class AIScorer {
    constructor() {
        this.cache = new Map();
        this.scoringWeights = {
            harmony: 0.25,
            innovation: 0.25,
            popularity: 0.5
        };

        // 加载全局颜色库（你粘贴的 traditionalColors）
        this.loadGlobalColorLibrary();
    }

    /**
     * 加载全局变量中的颜色库
     * 检测方式：typeof + window对象 [^9^][^12^]
     */
    loadGlobalColorLibrary() {
        this.userColorDB = null;

        // 检测全局变量 traditionalColors（你粘贴的变量名）
        // 方法1：使用 typeof 检测（安全，不会报错）[^9^]
        if (typeof traditionalColors !== 'undefined') {
            console.log('[AI Scorer] 检测到全局变量 traditionalColors');
            this.userColorDB = this.parseColorLibrary(traditionalColors);
        }
        // 方法2：通过 window 对象检测（兼容浏览器环境）[^12^]
        else if (typeof window !== 'undefined' && window.traditionalColors) {
            console.log('[AI Scorer] 通过 window 对象检测到 traditionalColors');
            this.userColorDB = this.parseColorLibrary(window.traditionalColors);
        }
        // 方法3：检测其他可能的变量名
        else {
            const alternativeNames = ['colorLibrary', 'myColors', 'colors'];
            for (const name of alternativeNames) {
                if (typeof window !== 'undefined' && window[name]) {
                    console.log(`[AI Scorer] 检测到全局变量 ${name}`);
                    this.userColorDB = this.parseColorLibrary(window[name]);
                    break;
                }
            }
        }

        // 设置最终使用的颜色库
        this.traditionalColorDB = this.userColorDB || [];

        // 输出加载结果
        if (this.traditionalColorDB.length > 0) {
            console.log(`[AI Scorer] 颜色库加载成功，共 ${this.traditionalColorDB.length} 种颜色`);
            // 显示各色系统计
            const stats = this.getFamilyStats();
            console.log('[AI Scorer] 色系分布:', stats);
        } else {
            console.warn('[AI Scorer] 未检测到颜色库，请确保在引入 ai-scorer.js 之前粘贴颜色数据');
        }
    }

    /**
     * 解析颜色库（支持分色系对象格式）
     */
    parseColorLibrary(data) {
        // 如果是数组格式 [{name, hex}, ...]
        if (Array.isArray(data)) {
            return data.map((c, idx) => ({
                name: c.name || `颜色${idx + 1}`,
                hex: (c.hex || c.color || '#CCCCCC').toUpperCase(),
                hue: this.hexToHue(c.hex || c.color || '#CCCCCC'),
                family: c.family || 'unknown'
            })).filter(c => c.hex !== '#CCCCCC');
        }

        // 如果是分色系对象格式 {red: [...], orange: [...], ...}
        if (typeof data === 'object' && data !== null) {
            const allColors = [];

            for (const [family, colors] of Object.entries(data)) {
                // 跳过非数组属性（如 custom: []）
                if (!Array.isArray(colors)) continue;

                colors.forEach((color, idx) => {
                    if (color && color.hex) {
                        allColors.push({
                            name: color.name || `${family}${idx + 1}`,
                            hex: color.hex.toUpperCase(),
                            hue: this.hexToHue(color.hex),
                            family: family  // 使用对象键作为色系名
                        });
                    }
                });
            }

            return allColors;
        }

        return [];
    }

    /**
     * 获取色系统计
     */
    getFamilyStats() {
        const stats = {};
        this.traditionalColorDB.forEach(c => {
            stats[c.family] = (stats[c.family] || 0) + 1;
        });
        return stats;
    }

    /**
     * 重新加载颜色库（供外部调用）
     */
    reloadColorLibrary() {
        this.loadGlobalColorLibrary();
        this.cache.clear();
        console.log('[AI Scorer] 颜色库已重新加载');
        return this.getLibraryInfo();
    }

    /**
     * 获取当前颜色库信息
     */
    getLibraryInfo() {
        if (this.traditionalColorDB.length === 0) {
            return {
                loaded: false,
                colorCount: 0,
                message: '未加载颜色库，请确保在HTML中粘贴 traditionalColors 数据',
                example: 'const traditionalColors = { red: [{name:"朱砂", hex:"#D4342F"}, ...], ... };'
            };
        }

        return {
            loaded: true,
            isUserLibrary: !!this.userColorDB,
            colorCount: this.traditionalColorDB.length,
            familyStats: this.getFamilyStats(),
            sampleColors: this.traditionalColorDB.slice(0, 5).map(c => ({
                name: c.name,
                hex: c.hex,
                family: c.family
            }))
        };
    }

    /**
     * 分析作品并返回完整评分
     */
    async analyzeWork(work) {
        const imageUrl = work.img;
        const cacheKey = this.generateCacheKey(imageUrl);

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // 如果没有颜色库，返回基础评分
            if (this.traditionalColorDB.length === 0) {
                return this.getBasicScore(work);
            }

            const features = await this.extractImageFeatures(work);
            const harmonyScore = this.evaluateHarmony(features);
            const innovationScore = this.evaluateInnovation(features, work);
            const popularityScore = this.calculatePopularity(work);
            const comment = this.generateComment(harmonyScore, innovationScore, features);

            const result = {
                harmony: Math.round(harmonyScore),
                innovation: Math.round(innovationScore),
                popularity: Math.round(popularityScore),
                features: features,
                comment: comment,
                timestamp: Date.now(),
                version: '1.0'
            };

            this.cache.set(cacheKey, result);
            return result;

        } catch (error) {
            console.error('AI评分失败:', error);
            return this.getDefaultScore();
        }
    }

    /**
     * 基础评分（无颜色库时使用）
     */
    getBasicScore(work) {
        const views = work.views || 0;
        const likes = work.likes || 0;
        const popularity = Math.min(100, (views / 10 + likes * 2));

        return {
            harmony: 60,
            innovation: 60,
            popularity: Math.round(popularity),
            comment: "系统未检测到传统颜色库（traditionalColors）。请在HTML文件中加入颜色数据：const traditionalColors = { red: [{name:'朱砂', hex:'#D4342F'}, ...] };",
            timestamp: Date.now(),
            isBasic: true
        };
    }

    /**
     * 快速计算评分
     */
    calculateScore(work) {
        if (this.traditionalColorDB.length === 0) {
            return this.getBasicScore(work);
        }

        const views = work.views || 0;
        const likes = work.likes || 0;
        const popularity = Math.min(100, (views / 10 + likes * 2));

        let harmony = 65;
        let innovation = 60;

        if (work.colors && work.colors.length > 0) {
            harmony = this.estimateHarmonyFromColors(work.colors);
            innovation = this.estimateInnovationFromColors(work.colors);
        }

        // 新作品加成
        const time = new Date(work.time || Date.now());
        const age = (Date.now() - time.getTime()) / (1000 * 60 * 60 * 24);
        if (age < 7) innovation += 5;

        return {
            harmony: Math.min(100, Math.round(harmony)),
            innovation: Math.min(100, Math.round(innovation)),
            popularity: Math.round(popularity),
            comment: this.generateQuickComment(harmony, innovation, work),
            timestamp: Date.now(),
            isEstimated: true
        };
    }

    /**
     * 提取图像特征
     */
    async extractImageFeatures(work) {
        await new Promise(r => setTimeout(r, 50));

        let detectedColors = [];

        // 优先使用作品自带的颜色数据
        if (work.colors && Array.isArray(work.colors) && work.colors.length > 0) {
            detectedColors = this.mapWorkColorsToTraditional(work.colors);
        } else {
            // 从颜色库随机选取模拟
            detectedColors = this.getRandomColorsFromLibrary(3);
        }

        return {
            colorHistogram: this.generateHistogramFromColors(detectedColors),
            traditionalColors: detectedColors,
            colorCount: detectedColors.length,
            composition: {
                ruleOfThirds: Math.random() * 0.4 + 0.6,
                symmetry: Math.random() * 0.5 + 0.5,
                balance: Math.random() * 0.3 + 0.7
            },
            complexity: Math.min(1, detectedColors.length / 8 + 0.3),
            texture: {
                uniformity: Math.random(),
                richness: Math.min(1, detectedColors.length / 6)
            },
            uniqueness: Math.random() * 0.4 + 0.6
        };
    }

    /**
     * 从颜色库随机选取颜色
     */
    getRandomColorsFromLibrary(count) {
        if (this.traditionalColorDB.length === 0) return [];

        const shuffled = [...this.traditionalColorDB].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, shuffled.length)).map(c => ({
            hex: c.hex,
            name: c.name,
            family: c.family,
            isTraditional: true
        }));
    }

    /**
     * 将作品颜色映射到颜色库
     */
    mapWorkColorsToTraditional(workColors) {
        if (this.traditionalColorDB.length === 0) {
            return workColors.map(c => ({
                hex: typeof c === 'string' ? c : (c.hex || '#CCCCCC'),
                name: typeof c === 'object' ? (c.name || '未知色') : '未知色',
                family: 'unknown',
                isTraditional: false
            }));
        }

        return workColors.map(color => {
            let hex, name;

            if (typeof color === 'string') {
                if (color.startsWith('#')) {
                    hex = color.toUpperCase();
                    name = this.findNearestColorName(hex);
                } else {
                    name = color;
                    const found = this.traditionalColorDB.find(c => c.name === color);
                    hex = found ? found.hex : '#CCCCCC';
                }
            } else if (typeof color === 'object') {
                hex = (color.hex || color.color || '#CCCCCC').toUpperCase();
                name = color.name || color.colorName || this.findNearestColorName(hex);
            }

            const nearest = this.findNearestColor(hex);
            return {
                hex: hex,
                name: name || (nearest ? nearest.name : '未知色'),
                family: nearest ? nearest.family : 'unknown',
                isTraditional: this.isColorInLibrary(hex)
            };
        });
    }

    /**
     * 查找最接近的颜色
     */
    findNearestColor(hex) {
        if (this.traditionalColorDB.length === 0) return null;

        const targetHue = this.hexToHue(hex);
        let nearest = null;
        let minDistance = Infinity;

        this.traditionalColorDB.forEach(color => {
            const distance = Math.abs(targetHue - color.hue);
            const circularDist = Math.min(distance, 360 - distance);
            if (circularDist < minDistance) {
                minDistance = circularDist;
                nearest = color;
            }
        });

        return nearest;
    }

    findNearestColorName(hex) {
        const nearest = this.findNearestColor(hex);
        return nearest ? nearest.name : null;
    }

    isColorInLibrary(hex) {
        if (this.traditionalColorDB.length === 0) return false;

        const hue = this.hexToHue(hex);
        return this.traditionalColorDB.some(color => {
            const diff = Math.abs(hue - color.hue);
            return Math.min(diff, 360 - diff) < 25;
        });
    }

    /**
     * HEX转色相值
     */
    hexToHue(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let hue = 0;

        if (max !== min) {
            const d = max - min;
            switch (max) {
                case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: hue = ((b - r) / d + 2) / 6; break;
                case b: hue = ((r - g) / d + 4) / 6; break;
            }
        }

        return Math.round(hue * 360);
    }

    generateHistogramFromColors(colors) {
        const histogram = new Array(360).fill(0);
        colors.forEach(color => {
            const hue = this.hexToHue(color.hex);
            histogram[hue] += 1;
        });
        const max = Math.max(...histogram);
        return histogram.map(h => h / (max || 1));
    }

    /**
     * 评估和谐度
     */
    evaluateHarmony(features) {
        let score = 70;

        const compositionScore = (
            features.composition.ruleOfThirds * 0.4 +
            features.composition.symmetry * 0.3 +
            features.composition.balance * 0.3
        ) * 100;

        const colorHarmony = this.calculateColorHarmony(features.traditionalColors);
        const traditionalCount = features.traditionalColors.filter(c => c.isTraditional).length;

        score = compositionScore * 0.3 + colorHarmony * 0.4 + 30 + (traditionalCount * 5);

        if (features.colorCount >= 2 && features.colorCount <= 5) {
            score += 10;
        } else if (features.colorCount > 8) {
            score -= 5;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * 计算色彩和谐度
     */
    calculateColorHarmony(colors) {
        if (colors.length < 2) return 60;

        let harmony = 70;
        const hues = colors.map(c => this.hexToHue(c.hex));

        let analogousPairs = 0;
        let complementaryPairs = 0;

        for (let i = 0; i < hues.length; i++) {
            for (let j = i + 1; j < hues.length; j++) {
                const diff = Math.abs(hues[i] - hues[j]);
                const circularDiff = Math.min(diff, 360 - diff);
                if (circularDiff < 30) analogousPairs++;
                if (circularDiff > 150 && circularDiff < 210) complementaryPairs++;
            }
        }

        harmony += analogousPairs * 5 + complementaryPairs * 8;

        // 同色系加分
        const families = {};
        colors.forEach(c => {
            if (c.family) families[c.family] = (families[c.family] || 0) + 1;
        });

        for (const count of Object.values(families)) {
            if (count >= 2) harmony += 5;
        }

        return Math.min(100, harmony);
    }

    /**
     * 评估创新度
     */
    evaluateInnovation(features, work) {
        let score = 60;

        score += features.uniqueness * 15;

        if (features.colorCount >= 3 && features.colorCount <= 6) {
            score += 10;
        }

        const uniqueFamilies = new Set(features.traditionalColors.map(c => c.family)).size;
        if (uniqueFamilies >= 3) score += 10;

        const nonTraditional = features.traditionalColors.filter(c => !c.isTraditional).length;
        if (nonTraditional > 0) {
            score += Math.min(15, nonTraditional * 5);
        }

        const likes = work.likes || 0;
        if (likes > 50) score += 15;
        else if (likes > 20) score += 10;
        else if (likes > 5) score += 5;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * 计算受欢迎度
     */
    calculatePopularity(work) {
        const views = work.views || 0;
        const likes = work.likes || 0;

        let score = views / 10 + likes * 2;

        const time = new Date(work.time || Date.now());
        const daysSince = (Date.now() - time.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
            score *= 1.2;
        }

        return Math.min(100, score);
    }

    /**
     * 估算和谐度（快速评分）
     */
    estimateHarmonyFromColors(colors) {
        if (!colors || colors.length === 0) return 65;

        const mapped = this.mapWorkColorsToTraditional(colors);
        const traditionalCount = mapped.filter(c => c.isTraditional).length;

        let score = 60 + (traditionalCount * 5);
        if (mapped.length >= 2 && mapped.length <= 5) {
            score += 10;
        }

        return Math.min(100, score);
    }

    /**
     * 估算创新度（快速评分）
     */
    estimateInnovationFromColors(colors) {
        if (!colors || colors.length === 0) return 60;

        const mapped = this.mapWorkColorsToTraditional(colors);
        const uniqueFamilies = new Set(mapped.map(c => c.family)).size;

        let score = 60;
        if (mapped.length >= 4) score += 10;
        if (uniqueFamilies >= 3) score += 10;

        return Math.min(100, score);
    }

    /**
     * 生成AI评语
     */
    generateComment(harmony, innovation, features) {
        const comments = [];
        const colors = features.traditionalColors;
        const traditionalCount = colors.filter(c => c.isTraditional).length;

        // 和谐度评价
        if (harmony >= 85) {
            comments.push("色彩和谐度极佳，");
        } else if (harmony >= 70) {
            comments.push("整体色彩协调，");
        } else {
            comments.push("色彩搭配尚有提升空间，");
        }

        // 传统色彩评价
        if (traditionalCount >= 3) {
            const colorNames = colors.filter(c => c.isTraditional).slice(0, 3).map(c => c.name).join('、');
            comments.push(`巧妙运用了${traditionalCount}种传统色彩（${colorNames}），体现了深厚的文化底蕴。`);
        } else if (traditionalCount > 0) {
            const colorNames = colors.filter(c => c.isTraditional).map(c => c.name).join('、');
            comments.push(`使用了${colorNames}等传统色彩，`);
        }

        // 创新度评价
        if (innovation >= 80) {
            comments.push("在传统基础上融入独特个人风格，极具创意，令人耳目一新。");
        } else if (innovation >= 65) {
            comments.push("有一定创新意识，可进一步挖掘个人艺术表达。");
        } else {
            comments.push("建议在传统技法基础上尝试更多创新元素。");
        }

        // 色系评价
        const families = [...new Set(colors.map(c => c.family).filter(f => f && f !== 'unknown'))];
        if (families.length >= 2) {
            comments.push(`跨色系搭配（${families.join('、')}）展现了丰富的色彩层次。`);
        }

        return comments.join("");
    }

    /**
     * 生成快速评语
     */
    generateQuickComment(harmony, innovation, work) {
        const colors = work.colors || [];
        const colorNames = colors.map(c => {
            if (typeof c === 'string') return c;
            return c.name || '未知色';
        }).join('、');

        if (harmony > 75 && innovation > 75) {
            return `AI初步评估：和谐与创新兼备的佳作。${colorNames ? '使用了' + colorNames + '。' : ''}深受用户喜爱。`;
        } else if (harmony > 75) {
            return `AI初步评估：色彩和谐优美${colorNames ? '（' + colorNames + '）' : ''}，建议增加创新元素。`;
        } else if (innovation > 75) {
            return `AI初步评估：创意独特${colorNames ? '，运用了' + colorNames : ''}，可优化色彩搭配提升整体和谐度。`;
        }
        return `AI初步评估：作品有潜力${colorNames ? '，当前使用' + colorNames : ''}，建议从色彩和谐与创意两方面继续打磨。`;
    }

    /**
     * 生成缓存键
     */
    generateCacheKey(imageUrl) {
        let hash = 0;
        for (let i = 0; i < imageUrl.length; i++) {
            const char = imageUrl.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `img_${Math.abs(hash)}`;
    }

    /**
     * 默认评分
     */
    getDefaultScore() {
        return {
            harmony: 60,
            innovation: 60,
            popularity: 50,
            comment: "AI评分暂时不可用，使用默认评分。",
            timestamp: Date.now(),
            isDefault: true
        };
    }

    /**
     * 批量评分
     */
    async batchScore(works) {
        const results = [];
        for (const work of works) {
            const score = await this.analyzeWork(work);
            results.push({ work, score });
        }
        return results;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIScorer;
}