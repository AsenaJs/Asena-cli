# Adapter Selection Implementation Plan

## 📋 Genel Bakış

Asena CLI'ya **Hono** ve **Ergenecore** adapter seçimi özelliği eklenmesi için detaylı implementasyon planı.

**Seçilen Yaklaşım:** Minimal JSON Config (Yaklaşım A)

---

## 🎯 Hedefler

1. `asena init` komutu adapter tercihi soracak
2. `asena create` komutu adapter tercihi soracak
3. Seçim `.asena/config.json` dosyasına kaydedilecek
4. Tüm kod üretimi (generate) bu seçime göre yapılacak
5. Default adapter: **Hono**

---

## 📁 Dosya Yapısı

```
.asena/
  └── config.json          # Yeni: Adapter seçimi ve CLI tercihleri
asena-config.ts            # Mevcut: Build configuration
```

**`.asena/config.json` Örneği:**
```json
{
  "adapter": "hono"
}
```

---

## 🔧 Implementasyon Adımları

### 1. Type Definitions Oluşturma

**Dosya:** `lib/types/adapterConfig.ts` (YENİ)

```typescript
/**
 * Supported adapter types for Asena projects
 */
export type AdapterType = 'hono' | 'ergenecore';

/**
 * CLI configuration stored in .asena/config.json
 */
export interface AdapterConfig {
  adapter: AdapterType;
}
```

**Amaç:** Type-safe adapter configuration yönetimi

---

### 2. Config Helper Fonksiyonları

**Dosya:** `lib/helpers/adapterConfigHelper.ts` (YENİ)

İçerik:
- `readAdapterConfig(): Promise<AdapterConfig>` - Config dosyasını okur
- `writeAdapterConfig(config: AdapterConfig): Promise<void>` - Config dosyasını yazar
- `getAdapterConfig(): Promise<AdapterType>` - Sadece adapter tipini döner
- `isAdapterConfigExists(): boolean` - Config dosyası var mı kontrol eder
- `ensureConfigDirectory(): void` - `.asena/` klasörünü oluşturur

**Kullanılacak Bun API'leri:**
- `Bun.file('.asena/config.json').json()` - JSON okuma
- `Bun.write('.asena/config.json', JSON.stringify(...))` - JSON yazma
- `fs.mkdirSync()` - Klasör oluşturma

**Örnek İmplementasyon:**
```typescript
import fs from 'fs';
import path from 'path';
import type { AdapterConfig, AdapterType } from '../types/adapterConfig';

const CONFIG_DIR = '.asena';
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function readAdapterConfig(): Promise<AdapterConfig> {
  if (!isAdapterConfigExists()) {
    return { adapter: 'hono' }; // Default
  }

  const configFile = Bun.file(CONFIG_FILE);
  return await configFile.json();
}

export async function writeAdapterConfig(config: AdapterConfig): Promise<void> {
  ensureConfigDirectory();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function getAdapterConfig(): Promise<AdapterType> {
  const config = await readAdapterConfig();
  return config.adapter;
}

export function isAdapterConfigExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function ensureConfigDirectory(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
```

---

### 3. Adapter Import Constants

**Dosya:** `lib/constants/adapters.ts` (YENİ)

Her adapter için import definitionları:

```typescript
import type { ImportsByFiles } from '../types';

/**
 * Hono Adapter imports
 */
export const HONO_ROOT_IMPORTS: ImportsByFiles = {
  '@asenajs/asena': ['AsenaServerFactory'],
  '@asenajs/hono-adapter': ['createHonoAdapter'],
};

export const HONO_CONTROLLER_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Controller'],
  '@asenajs/asena/web': ['Get'],
  '@asenajs/hono-adapter': ['type Context'],
};

export const HONO_MIDDLEWARE_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Middleware'],
  '@asenajs/hono-adapter': ['type Context', 'MiddlewareService'],
};

/**
 * Ergenecore Adapter imports
 */
export const ERGENECORE_ROOT_IMPORTS: ImportsByFiles = {
  '@asenajs/asena': ['AsenaServerFactory'],
  '@asenajs/ergenecore': ['createErgenecoreAdapter'],
};

export const ERGENECORE_CONTROLLER_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Controller'],
  '@asenajs/asena/web': ['Get'],
  '@asenajs/ergenecore': ['type Context'],
};

export const ERGENECORE_MIDDLEWARE_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Middleware'],
  '@asenajs/ergenecore': ['type Context', 'MiddlewareService'],
};

/**
 * Adapter package names for installation
 */
export const ADAPTER_PACKAGES: Record<'hono' | 'ergenecore', string> = {
  hono: '@asenajs/hono-adapter',
  ergenecore: '@asenajs/ergenecore',
};
```

**✅ KONTROL EDİLDİ:** Her iki adapter'ın export yapısı doğrulandı.

---

### 4. Adapter Import Getter

**Dosya:** `lib/helpers/adapterImportHelper.ts` (YENİ)

Adapter tipine göre doğru importları döner:

```typescript
import type { ImportsByFiles } from '../types';
import type { AdapterType } from '../types/adapterConfig';
import {
  HONO_ROOT_IMPORTS,
  HONO_CONTROLLER_IMPORTS,
  HONO_MIDDLEWARE_IMPORTS,
  ERGENECORE_ROOT_IMPORTS,
  ERGENECORE_CONTROLLER_IMPORTS,
  ERGENECORE_MIDDLEWARE_IMPORTS,
} from '../constants/adapters';

export function getRootImports(adapter: AdapterType): ImportsByFiles {
  return adapter === 'hono' ? HONO_ROOT_IMPORTS : ERGENECORE_ROOT_IMPORTS;
}

export function getControllerImports(adapter: AdapterType): ImportsByFiles {
  return adapter === 'hono' ? HONO_CONTROLLER_IMPORTS : ERGENECORE_CONTROLLER_IMPORTS;
}

export function getMiddlewareImports(adapter: AdapterType): ImportsByFiles {
  return adapter === 'hono' ? HONO_MIDDLEWARE_IMPORTS : ERGENECORE_MIDDLEWARE_IMPORTS;
}

export function getAdapterFunctionName(adapter: AdapterType): string {
  return adapter === 'hono' ? 'createHonoAdapter' : 'createErgenecoreAdapter';
}

export function getAdapterPackage(adapter: AdapterType): string {
  return adapter === 'hono' ? '@asenajs/hono-adapter' : '@asenajs/ergenecore';
}
```

---

### 5. Init Command Güncelleme

**Dosya:** `lib/commands/Init.ts` (GÜNCELLEME)

**Değişiklikler:**

1. Kullanıcıya adapter seçimi sorulacak
2. `.asena/config.json` oluşturulacak
3. Mevcut `asena-config.ts` oluşturma korunacak

**Güncellenmiş `exec()` metodu:**

```typescript
import inquirer from 'inquirer';
import { writeAdapterConfig } from '../helpers/adapterConfigHelper';
import type { AdapterType } from '../types/adapterConfig';

public async exec() {
  if (!isAsenaConfigExists()) {
    // 1. Adapter seçimi sor
    const { adapter } = await this.askAdapterQuestion();

    // 2. .asena/config.json oluştur
    await writeAdapterConfig({ adapter });

    // 3. CLI paketini yükle
    if (!(await getAsenaCliVersion())) {
      const asenaCliVersion = await $`asena --version`.quiet().text();
      await $`bun add -D @asenajs/asena-cli@${asenaCliVersion}`.quiet();
    }

    // 4. asena-config.ts oluştur
    const numberOfBytes = await Bun.write('asena-config.ts', INITIAL_ASENA_CONFIG_TS);

    if (numberOfBytes === 0) {
      throw new Error('Failed to create asena config');
    }
  } else {
    console.log('\x1b[31m%s\x1b[0m', 'Config file already exists');
  }
}

private async askAdapterQuestion(): Promise<{ adapter: AdapterType }> {
  return inquirer.prompt([
    {
      type: 'list',
      name: 'adapter',
      message: 'Which adapter do you want to use?',
      choices: [
        { name: 'Hono Adapter (Recommended)', value: 'hono' },
        { name: 'Ergenecore Adapter', value: 'ergenecore' },
      ],
      default: 'hono',
    },
  ]);
}
```

---

### 6. Create Command Güncelleme

**Dosya:** `lib/commands/Create.ts` (GÜNCELLEME)

**Değişiklikler:**

1. Adapter seçimi sorulacak
2. Seçime göre paket yüklenecek
3. Seçime göre kod üretilecek
4. `.asena/config.json` oluşturulacak

**Güncellenmiş metodlar:**

```typescript
import { writeAdapterConfig } from '../helpers/adapterConfigHelper';
import { getRootImports, getAdapterFunctionName, getAdapterPackage } from '../helpers/adapterImportHelper';
import type { AdapterType } from '../types/adapterConfig';

private preference: ProjectSetupOptions = {
  projectName: 'AsenaProject',
  adapter: 'hono',  // YENİ ALAN
  logger: true,
  eslint: true,
  prettier: true,
};

private async askQuestions(): Promise<ProjectSetupOptions> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Enter your project name:',
      validate: (input: string) => (input ? true : 'Project name cannot be empty!'),
      default: 'AsenaProject',
    },
    {
      type: 'list',  // YENİ SORU
      name: 'adapter',
      message: 'Which adapter do you want to use?',
      choices: [
        { name: 'Hono Adapter (Recommended)', value: 'hono' },
        { name: 'Ergenecore Adapter', value: 'ergenecore' },
      ],
      default: 'hono',
    },
    {
      type: 'confirm',
      name: 'logger',
      message: 'Do you want to setup default asena logger?[Yes by default]',
      default: true,
    },
    {
      type: 'confirm',
      name: 'eslint',
      message: 'Do you want to setup ESLint?[Yes by default]',
      default: true,
    },
    {
      type: 'confirm',
      name: 'prettier',
      message: 'Do you want to setup Prettier?[Yes by default]',
      default: true,
    },
  ]);

  return {
    projectName: answers.projectName,
    adapter: answers.adapter,
    logger: answers.logger,
    eslint: answers.eslint,
    prettier: answers.prettier,
  };
}

private async create(currentFolder: boolean, spinner: Ora) {
  this.preference = await this.askQuestions();

  spinner.start();

  const projectPath = currentFolder ? process.cwd() : path.resolve(process.cwd(), this.preference.projectName);

  await this.createPackageJson(projectPath);
  await this.createDefaultController(projectPath);

  if (this.preference.logger) await this.createAsenaLogger(projectPath);

  await this.createDefaultIndexFile(projectPath);

  if (!currentFolder) process.chdir(projectPath);

  // .asena/config.json oluştur (YENI)
  await writeAdapterConfig({ adapter: this.preference.adapter });

  await this.installPreRequests();

  if (this.preference.eslint) await this.installAndCreateEslint();
  if (this.preference.prettier) await this.installAndCreatePrettier();

  await this.createTsConfig();
  await new Init().exec();
}

private async createDefaultIndexFile(projectPath: string) {
  let rootFileCode = '';
  const adapter = this.preference.adapter;

  // Adapter'a göre importları al
  const rootFileImports = getRootImports(adapter);

  if (this.preference.logger) {
    rootFileImports['logger/logger'] = ['logger'];
  }

  rootFileCode = new ImportHandler(rootFileCode, ImportType.IMPORT)
    .importToCode(rootFileImports, ImportType.IMPORT);

  // ÖNEMLI: Adapter'ların farklı signature'ları var!
  // Hono: createHonoAdapter(logger) -> [adapter, logger]
  // Ergenecore: createErgenecoreAdapter({ logger }) -> adapter

  if (adapter === 'hono') {
    // Hono tuple döndürüyor
    rootFileCode += `\nconst [honoAdapter, asenaLogger] = createHonoAdapter(${this.preference.logger ? 'logger' : 'console'});\n`;
    rootFileCode += new AsenaServerHandler('')
      .createEmptyAsenaServer('honoAdapter', 'asenaLogger').asenaServer;
  } else {
    // Ergenecore sadece adapter döndürüyor
    const loggerArg = this.preference.logger ? 'logger' : 'console';
    rootFileCode += `\nconst ergenecoreAdapter = createErgenecoreAdapter({ logger: ${loggerArg} });\n`;
    rootFileCode += `const asenaLogger = ${loggerArg};\n`;
    rootFileCode += new AsenaServerHandler('')
      .createEmptyAsenaServer('ergenecoreAdapter', 'asenaLogger').asenaServer;
  }

  await Bun.write(projectPath + '/src/index.ts', rootFileCode);
}

private async installPreRequests() {
  const adapterPackage = getAdapterPackage(this.preference.adapter);

  await $`bun add @asenajs/asena ${adapterPackage}`.quiet();

  if (this.preference.logger) {
    await $`bun add @asenajs/asena-logger`.quiet();
  }

  await $`bun add -D @types/bun typescript`.quiet();
}
```

**Type güncellemesi:**

```typescript
// lib/types/create.ts
import type { AdapterType } from './adapterConfig';

export interface ProjectSetupOptions {
  projectName: string;
  adapter: AdapterType;  // YENİ
  logger: boolean;
  eslint: boolean;
  prettier: boolean;
}
```

---

### 7. Generate Command Güncelleme

**Dosya:** `lib/commands/Generate.ts` (GÜNCELLEME)

**Değişiklikler:**

1. `.asena/config.json` okunacak
2. Adapter'a göre importlar kullanılacak

**Güncellenmiş metodlar:**

```typescript
import { getAdapterConfig } from '../helpers/adapterConfigHelper';
import { getControllerImports, getMiddlewareImports } from '../helpers/adapterImportHelper';

private async generateController() {
  const controllerName = convertToPascalCase(removeExtension((await this.askQuestions('controller')).elementName));
  const importType = await getImportType();

  // Adapter config'i oku
  const adapter = await getAdapterConfig();

  const controllerCode =
    new ImportHandler('', importType).importToCode(
      { '@asenajs/asena/server': ['Controller'] },
      importType
    ) + new ControllerHandler('').addController(controllerName, null).code;

  await this.generate(controllerCode, 'controllers', controllerName);
}

private async addMiddleware() {
  const middlewareName = convertToPascalCase(removeExtension((await this.askQuestions('middleware')).elementName));
  const importType = await getImportType();

  // Adapter config'i oku
  const adapter = await getAdapterConfig();
  const middlewareImports = getMiddlewareImports(adapter);

  const middlewareCode =
    new ImportHandler('', importType).importToCode(middlewareImports, importType) +
    new MiddlewareHandler('').addMiddleware(middlewareName).addDefaultHandle(middlewareName).code;

  await this.generate(middlewareCode, 'middlewares', middlewareName);
}
```

---

### 8. Constants Güncellemesi

**Dosya:** `lib/constants/create.ts` (GÜNCELLEME)

Hono-specific constantları kaldır, adapter helper'a taşı:

```typescript
// ESKİ - KALDIRILACAK
export const ROOT_FILE_IMPORTS: ImportsByFiles = {
  '@asenajs/asena': ['AsenaServerFactory'],
  '@asenajs/hono-adapter': ['createHonoAdapter'],
};

export const CONTROLLER_IMPORTS: ImportsByFiles = {
  '@asenajs/asena/server': ['Controller'],
  '@asenajs/asena/web': ['Get'],
  '@asenajs/hono-adapter': ['type Context'],
};

// YENİ - Bu constantlar lib/constants/adapters.ts'ye taşınacak
```

---

## 🧪 Test Senaryoları

### Test 1: Init with Hono (Default)
```bash
asena init
# Adapter seçimi: Hono
# .asena/config.json oluşturulmalı: { "adapter": "hono" }
# asena-config.ts oluşturulmalı
```

### Test 2: Init with Ergenecore
```bash
asena init
# Adapter seçimi: Ergenecore
# .asena/config.json oluşturulmalı: { "adapter": "ergenecore" }
```

### Test 3: Create with Hono
```bash
asena create my-project
# Adapter seçimi: Hono
# @asenajs/hono-adapter yüklenmeli
# src/index.ts'de createHonoAdapter kullanılmalı
# .asena/config.json oluşturulmalı
```

### Test 4: Create with Ergenecore
```bash
asena create my-project
# Adapter seçimi: Ergenecore
# @asenajs/ergenecore yüklenmeli
# src/index.ts'de createErgenecoreAdapter kullanılmalı
# .asena/config.json oluşturulmalı
```

### Test 5: Generate Controller (Hono project)
```bash
cd hono-project
asena g c User
# Hono imports kullanılmalı
# @asenajs/hono-adapter'dan Context import edilmeli
```

### Test 6: Generate Middleware (Ergenecore project)
```bash
cd ergenecore-project
asena g m Auth
# Ergenecore imports kullanılmalı
# @asenajs/ergenecore'dan Context, MiddlewareService import edilmeli
```

---

## 📝 Implementation Checklist

### Yeni Dosyalar
- [ ] `lib/types/adapterConfig.ts` - Type definitions
- [ ] `lib/helpers/adapterConfigHelper.ts` - Config read/write operations
- [ ] `lib/helpers/adapterImportHelper.ts` - Import getter functions
- [ ] `lib/constants/adapters.ts` - Adapter-specific imports

### Güncellenecek Dosyalar
- [ ] `lib/commands/Init.ts` - Adapter seçimi ekleme
- [ ] `lib/commands/Create.ts` - Adapter seçimi ve kullanımı
- [ ] `lib/commands/Generate.ts` - Adapter'a göre kod üretimi
- [ ] `lib/types/create.ts` - ProjectSetupOptions'a adapter alanı ekleme
- [ ] `lib/constants/create.ts` - Hono-specific constantları kaldırma

### Export Güncellemeleri
- [ ] `lib/types/index.ts` - AdapterConfig ve AdapterType export
- [ ] `lib/helpers/index.ts` - Yeni helper fonksiyonlarını export
- [ ] `lib/constants/index.ts` - Adapter constants export

---

## 🎯 Önemli Notlar

### 1. Adapter Signature Farkları ⚠️

**KRITIK:** İki adapter'ın factory fonksiyonları farklı signature'lara sahip!

**Hono Adapter:**
```typescript
// createHonoAdapter bir TUPLE döndürüyor
export const createHonoAdapter = (logger?: ServerLogger): [HonoAdapter, ServerLogger]
// Kullanım:
const [honoAdapter, asenaLogger] = createHonoAdapter(logger);
```

**Ergenecore Adapter:**
```typescript
// createErgenecoreAdapter sadece adapter instance döndürüyor
export function createErgenecoreAdapter(options: ErgenecoreOptions): Ergenecore
// Kullanım:
const ergenecoreAdapter = createErgenecoreAdapter({ logger });
const asenaLogger = logger; // Logger'ı ayrıca tutmalıyız
```

Bu fark, kod üretiminde dikkate alınmalı! (Bkz: Section 6 - createDefaultIndexFile)

### 2. Doğrulanmış Export Yapıları ✅

**Hono Adapter Exports:**
```typescript
import { createHonoAdapter } from '@asenajs/hono-adapter';
import { type Context, MiddlewareService } from '@asenajs/hono-adapter';
```

**Ergenecore Adapter Exports:**
```typescript
import { createErgenecoreAdapter } from '@asenajs/ergenecore';
import { type Context, MiddlewareService } from '@asenajs/ergenecore';
```

**✅ VERIFIED:** Her iki adapter'ın export yapısı kontrol edildi ve doğrulandı.

### 3. Backward Compatibility
Mevcut projelerde `.asena/config.json` yoksa:
- Default olarak `hono` adapter varsayılmalı
- Kullanıcıya uyarı gösterilmeli: "No adapter config found, using 'hono' by default"

### 4. Error Handling
- `.asena/config.json` corrupt ise → Default'a düş
- Bilinmeyen adapter tipi varsa → Error at ve desteklenen adapter'ları listele

### 5. Migration Guide
Mevcut Hono kullanan projelere `.asena/config.json` ekleme:
```bash
mkdir -p .asena
echo '{"adapter":"hono"}' > .asena/config.json
```

---

## 🚀 İmplementasyon Sırası

1. **Type Definitions** → Önce type'ları oluştur
2. **Config Helpers** → Config okuma/yazma fonksiyonları
3. **Adapter Constants** → Import definitionları
4. **Import Helpers** → Getter fonksiyonlar
5. **Init Command** → Adapter seçimi ekleme
6. **Create Command** → Full adapter support
7. **Generate Command** → Adapter'a göre kod üretimi
8. **Testing** → Tüm senaryoları test et

---

## 📚 Referanslar

- Bun File API: https://bun.sh/docs/api/file-io
- Bun JSON: https://bun.sh/docs/api/file-io#reading-files-bun-file
- Inquirer: https://github.com/SBoudrias/Inquirer.js

---

**Son Güncelleme:** 2025-10-14
**Yaklaşım:** Minimal JSON Config (A)
**Status:** Ready for Implementation
