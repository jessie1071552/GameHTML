/**
 * CharacterFactory - JSONからキャラクター・技データをロードして
 * プレイヤー・仲間・敵のインスタンスデータを生成するファクトリ
 *
 * Phaser の preload 完了後に init() を呼ぶこと。
 * （fetch を使うため GameScene.create() 以降でのみ利用可能）
 */
export class CharacterFactory {
  constructor() {
    this._skillMaster = {};    // { skillId: SkillDef }
    this._charDefs    = {};    // { characterId: CharDef }
    this._ready       = false;
  }

  // ──────────────────────────────────────────────────────────
  //  初期化：JSONをロードしてキャッシュする
  // ──────────────────────────────────────────────────────────
  async init() {
    const [skillData, ...charDataList] = await Promise.all([
      this._fetchJson('assets/data/skills/skill_master.json'),
      this._fetchJson('assets/data/characters/player.json'),
      this._fetchJson('assets/data/characters/slime.json'),
      this._fetchJson('assets/data/characters/goblin.json'),
      this._fetchJson('assets/data/characters/orc.json'),
    ]);

    this._skillMaster = skillData;
    for (const def of charDataList) {
      this._charDefs[def.id] = def;
    }
    this._ready = true;
  }

  async _fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  // ──────────────────────────────────────────────────────────
  //  プレイヤーデータを生成する
  //  戻り値は GameScene._playerData と同じ形式
  // ──────────────────────────────────────────────────────────
  createPlayer(position) {
    const def   = this._charDefs['player'];
    const level = 1;
    const stats = this._calcStats(def, level);

    return {
      type:        'player',
      characterId: 'player',
      name:        def.name,
      level,
      exp:         0,
      expToNext:   def.expToLevel * level,
      ...stats,
      position:    { ...position },
      skills:      this._buildSkills(def, level),
      def,           // キャラ定義参照（レベルアップ時に使用）
    };
  }

  // ──────────────────────────────────────────────────────────
  //  仲間データを生成する（Enemy から変換する場合）
  // ──────────────────────────────────────────────────────────
  createAllyFromEnemy(enemy, position) {
    const def   = this._charDefs[enemy.characterId];
    if (!def) return null;
    const level = enemy.level;
    const stats = this._calcStats(def, level);

    return {
      type:        'ally',
      characterId: enemy.characterId,
      name:        def.name,
      level,
      exp:         0,
      expToNext:   def.expToLevel * level,
      ...stats,
      position:    { ...position },
      command:     'follow',
      skills:      this._buildSkills(def, level),
      def,
    };
  }

  // ──────────────────────────────────────────────────────────
  //  敵データを生成する
  // ──────────────────────────────────────────────────────────
  createEnemy(characterId, position, level) {
    const def   = this._charDefs[characterId] ?? this._charDefs['slime'];
    const stats = this._calcStats(def, level);

    return {
      type:        'enemy',
      characterId,
      name:        def.name,
      level,
      expDrop:     Math.floor(def.expDrop + 2 * (level - 1)),
      ...stats,
      position:    { ...position },
      state:       'roaming',
      def,
    };
  }

  // ──────────────────────────────────────────────────────────
  //  技スロットを構築する（initialSkills + レベルアップ習得分）
  // ──────────────────────────────────────────────────────────
  _buildSkills(def, level) {
    const learned = new Set(def.initialSkills ?? []);

    // 現在のレベルまでに習得できる技を追加
    for (const entry of (def.learnset ?? [])) {
      if (entry.level <= level) learned.add(entry.skillId);
    }

    // 最大4スロット
    const skillIds = [...learned].slice(0, 4);
    return skillIds.map(id => {
      const master = this._skillMaster[id];
      if (!master) return null;
      return {
        id,
        name:   master.name,
        type:   master.type,
        power:  master.power,
        maxPp:  master.pp,
        pp:     master.pp,   // 現在PP（消耗する）
        range:  master.range,
      };
    }).filter(Boolean);
  }

  // ──────────────────────────────────────────────────────────
  //  レベル補正済みステータスを計算する
  // ──────────────────────────────────────────────────────────
  _calcStats(def, level) {
    const b = def.baseStats;
    const g = def.growthRate;
    const lv = level - 1;
    const maxHp = b.hp + g.hp * lv;
    return {
      hp:      maxHp,
      maxHp,
      attack:  b.attack  + g.attack  * lv,
      defense: b.defense + g.defense * lv,
    };
  }

  // ──────────────────────────────────────────────────────────
  //  レベルアップ処理（破壊的変更）
  //  戻り値: { leveledUp: boolean, newSkills: SkillSlot[] }
  // ──────────────────────────────────────────────────────────
  tryLevelUp(entity) {
    if (!entity.def) return { leveledUp: false, newSkills: [] };

    let leveled = false;
    const newSkills = [];

    while (entity.exp >= entity.expToNext) {
      entity.exp      -= entity.expToNext;
      entity.level    += 1;
      entity.expToNext = entity.def.expToLevel * entity.level;

      const g = entity.def.growthRate;
      entity.maxHp   += g.hp;
      entity.hp       = Math.min(entity.hp + g.hp, entity.maxHp);
      entity.attack  += g.attack;
      entity.defense += g.defense;
      leveled = true;

      // レベルアップで習得する技をチェック
      for (const entry of (entity.def.learnset ?? [])) {
        if (entry.level === entity.level) {
          const master = this._skillMaster[entry.skillId];
          if (master && entity.skills.length < 4 &&
              !entity.skills.find(s => s.id === entry.skillId)) {
            const slot = {
              id:    entry.skillId,
              name:  master.name,
              type:  master.type,
              power: master.power,
              maxPp: master.pp,
              pp:    master.pp,
              range: master.range,
            };
            entity.skills.push(slot);
            newSkills.push(slot);
          }
        }
      }
    }

    return { leveledUp: leveled, newSkills };
  }

  // ──────────────────────────────────────────────────────────
  //  技マスターデータを取得
  // ──────────────────────────────────────────────────────────
  getSkill(skillId) {
    return this._skillMaster[skillId] ?? null;
  }

  get isReady() { return this._ready; }
}
