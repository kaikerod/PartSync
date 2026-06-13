# PartSync 📦

*Translations: [Português (BR)](#partsync-) | [English](#part-sync--english-version)*

O **PartSync** é uma ferramenta web moderna e responsiva projetada especificamente para simplificar, centralizar e padronizar o registro e controle de solicitações de peças de reposição dentro de assistências técnicas de dispositivos.

A aplicação foi criada para fornecer um fluxo de trabalho claro e organizado desde o momento em que o técnico diagnostica a necessidade de uma peça até a sua efetiva compra pela logística e entrega na bancada de reparo.

---

## ✨ Recursos Principais

- 📱 **Interface Fluida e Moderna**: Design escuro de alta performance (Dark Mode por padrão) com elementos em *glassmorphism* e efeitos sutis de iluminação.
- 📋 **Ficha de Solicitação em Tempo Real**: Um resumo visual em estilo "ficha técnica" é gerado em tempo real conforme o formulário é preenchido, permitindo que o técnico copie um relatório formatado das especificações com um único clique (ótimo para colar em sistemas, e-mails ou chats internos).
- ⚡ **Níveis de Urgência**: Identificação visual clara (Baixa, Média e Urgente com indicador pulsante) para ajudar o setor logístico a priorizar as compras.
- 🧠 **Autocompletar Inteligente**: Sugestões inteligentes de modelos focadas exclusivamente na marca **Samsung Galaxy** e peças **Originais de Fábrica** (Telas AMOLED, Baterias Originais, Conectores de Carga, etc.).
- 📦 **Painel de Controle (Dashboard)**: Estatísticas rápidas de solicitações (Total, Pendentes, Encomendadas e Entregues) para dar visibilidade do fluxo operacional.
- 📜 **Histórico Geral**: Lista pesquisável e filtrável de solicitações. Permite alterar o status da peça individualmente (Pendente ➡️ Encomendado ➡️ Entregue ➡️ Cancelado) registrando notas de histórico.
- 🗳️ **Alteração de Status em Lote (Bulk Update)**: Selecione múltiplos registros ativos de uma vez no histórico e aplique uma atualização em lote (ex: marcar 5 peças como "Encomendadas" simultaneamente), poupando tempo na gestão.
- ⚙️ **Configurações Locais**: Permite definir o nome padrão do técnico.
- 💾 **Exportação de Dados (CSV)**: Faça o download das suas solicitações localmente em formato `.csv` compatível com Excel e Google Sheets para relatórios e acompanhamento de auditoria.

---

## 🛠️ Tecnologias Utilizadas

- **HTML5** (Semântico)
- **CSS3** (Variáveis nativas, animações personalizadas e layout responsivo com Grid e Flexbox)
- **JavaScript ES6** (Manipulação de DOM, persistência local e roteamento interno sem frameworks pesados)
- **Vite** (Ambiente de desenvolvimento e compilação ultra-rápido)
- **Lucide Icons** (Ícones vetoriais modernos e minimalistas)

---

## 🚀 Como Executar o Projeto Localmente

Certifique-se de possuir o [Node.js](https://nodejs.org/) instalado em seu computador.

1. Instale as dependências necessárias do projeto:
   ```bash
   npm install
   ```

2. Inicie o servidor de desenvolvimento local:
   ```bash
   npm run dev
   ```

3. Abra o navegador no endereço indicado (geralmente `http://localhost:5173`).

---

## 🗄️ Banco de Dados e Deploy

O **PartSync** possui suporte híbrido a banco de dados: utiliza **SQLite** localmente para facilitar o desenvolvimento (zero-config) e **PostgreSQL (Neon)** em produção quando publicado na **Vercel**.

### 💻 Desenvolvimento Local (SQLite)

Durante o desenvolvimento local, o servidor Node.js cria e configura automaticamente um banco de dados SQLite em `data/partsync.sqlite`.

- **Requisito**: Use o Node.js v22 ou superior (que fornece o módulo nativo `node:sqlite`).
- **Comando**: Execute `npm run dev` para iniciar o servidor de desenvolvimento.
- **Customização**: É possível customizar o caminho do banco definindo as variáveis `PARTSYNC_DB_PATH` ou `PARTSYNC_DATA_DIR` no arquivo `.env` ou `.env.local`.

### 🚀 Deploy em Produção na Vercel com Neon (PostgreSQL)

Quando o projeto é implantado na **Vercel**, ele utiliza as Serverless Functions configuradas na pasta `api/` e se conecta automaticamente ao **Neon** via `@neondatabase/serverless`. As tabelas e índices do banco são criados e inicializados de forma automática na primeira requisição ao servidor.

#### Passo 1: Criar o Banco de Dados no Neon
1. Acesse [neon.tech](https://neon.tech/) e crie uma conta gratuita.
2. Crie um novo projeto PostgreSQL.
3. Copie a string de conexão (Connection String) fornecida na dashboard do Neon (ela terá o formato `postgresql://usuario:senha@host/neondb?sslmode=require`).

#### Passo 2: Configurar Variável de Ambiente na Vercel
Nas configurações do seu projeto na Vercel (**Settings > Environment Variables**), adicione a seguinte variável:

- **Nome**: `DATABASE_URL`
- **Valor**: *A string de conexão copiada do Neon*

#### Passo 3: Realizar o Deploy
Faça o deploy importando o repositório Git na dashboard da Vercel ou via CLI executando:
```bash
vercel
```

Uma vez configurado e publicado, as chamadas para `/api/*` serão roteadas para a Vercel e persistidas com segurança no Neon.

---

# PartSync 📦 (English Version)

*Translations: [Português (BR)](#partsync-) | [English](#part-sync--english-version)*

**PartSync** is a modern and responsive web tool designed specifically to simplify, centralize, and standardize the registration and tracking of spare part requests within device repair shops.

The application was created to provide a clear and organized workflow from the moment the technician diagnoses the need for a part to its actual purchase by logistics and delivery to the repair bench.

---

## ✨ Key Features

- 📱 **Fluid and Modern Interface**: High-performance dark design (Dark Mode by default) with glassmorphism elements and subtle lighting effects.
- 📋 **Real-Time Request Sheet**: A visual summary in a "spec sheet" style is generated in real-time as the form is filled out, allowing the technician to copy a formatted report of the specs with a single click (great for pasting into systems, emails, or internal chats).
- ⚡ **Urgency Levels**: Clear visual identification (Low, Medium, and Urgent with a pulsing indicator) to help the logistics sector prioritize purchases.
- 🧠 **Smart Autocomplete**: Smart model suggestions focused exclusively on the **Samsung Galaxy** brand and **Factory Original** parts (AMOLED Screens, Original Batteries, Charging Connectors, etc.).
- 📦 **Control Panel (Dashboard)**: Quick request statistics (Total, Pending, Ordered, and Delivered) to provide visibility of the operational flow.
- 📜 **General History**: Searchable and filterable list of requests. Allows changing the status of the part individually (Pending ➡️ Ordered ➡️ Delivered ➡️ Canceled) registering history notes.
- 🗳️ **Bulk Status Update**: Select multiple active records at once in the history and apply a batch update (e.g., mark 5 parts as "Ordered" simultaneously), saving management time.
- ⚙️ **Local Settings**: Allows setting the default technician name.
- 💾 **Data Export (CSV)**: Download your requests locally in a `.csv` format compatible with Excel and Google Sheets for reporting and audit tracking.

---

## 🛠️ Technologies Used

- **HTML5** (Semantic)
- **CSS3** (Native variables, custom animations, and responsive layout with Grid and Flexbox)
- **JavaScript ES6** (DOM manipulation, local persistence, and internal routing without heavy frameworks)
- **Vite** (Ultra-fast build and development environment)
- **Lucide Icons** (Modern and minimalist vector icons)

---

## 🚀 How to Run the Project Locally

Make sure you have [Node.js](https://nodejs.org/) installed on your computer.

1. Install the necessary project dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser at the indicated address (usually `http://localhost:5173`).

---

## 🗄️ Database and Deployment

**PartSync** has hybrid database support: it uses **SQLite** locally for easy development (zero-config) and **PostgreSQL (Neon)** in production when published on **Vercel**.

### 💻 Local Development (SQLite)

During local development, the Node.js server automatically creates and configures a SQLite database at `data/partsync.sqlite`.

- **Requirement**: Use Node.js v22 or higher (which provides the native `node:sqlite` module).
- **Command**: Run `npm run dev` to start the development server.
- **Customization**: You can customize the database path by defining the `PARTSYNC_DB_PATH` or `PARTSYNC_DATA_DIR` variables in the `.env` or `.env.local` file.

### 🚀 Production Deployment on Vercel with Neon (PostgreSQL)

When the project is deployed on **Vercel**, it uses the Serverless Functions configured in the `api/` folder and automatically connects to **Neon** via `@neondatabase/serverless`. Database tables and indexes are automatically created and initialized on the first request to the server.

#### Step 1: Create the Database in Neon
1. Go to [neon.tech](https://neon.tech/) and create a free account.
2. Create a new PostgreSQL project.
3. Copy the Connection String provided in the Neon dashboard (it will be in the format `postgresql://username:password@host/neondb?sslmode=require`).

#### Step 2: Configure Environment Variable on Vercel
In your Vercel project settings (**Settings > Environment Variables**), add the following variable:

- **Name**: `DATABASE_URL`
- **Value**: *The Connection String copied from Neon*

#### Step 3: Deploy
Deploy by importing your Git repository on the Vercel dashboard or via CLI by running:
```bash
vercel
```

Once configured and published, calls to `/api/*` will be routed to Vercel and securely persisted in Neon.
