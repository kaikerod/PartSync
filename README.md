# PartSync 📦

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
- ⚙️ **Configurações Locais**: Permite definir o nome padrão do técnico solicitante para autopreenchimento rápido.
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

## 📝 Como Configurar para Uso Diário

1. Ao abrir o aplicativo pela primeira vez, vá até a aba **Ajustes** (ou **Configurações**).
2. Defina o seu **Nome do Técnico Padrão** para evitar ter que digitar seu nome a cada novo pedido.
3. Clique em **Salvar Preferências**.
4. Pronto! O PartSync estará configurado e pronto para uso no seu dispositivo.
---

## Banco SQLite

Servidor Node cria automaticamente o banco local em `data/partsync.sqlite`.
Use `npm run dev` para abrir app com API e SQLite.
Use `npm run preview` para compilar e servir versao de producao.
