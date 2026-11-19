# Jarvis: assistente pessoal de voz

App web instalável (PWA) que funciona no **celular Android** e no **computador**, com voz em português.
É 100% gratuito: a IA é o Google Gemini (cota gratuita), e a voz usa o próprio navegador Chrome.

## O que ele faz

- Conversa por voz ou texto, com respostas faladas
- 🌦️ Clima atual e previsão (Open-Meteo, sem cadastro)
- ⏰ Lembretes com voz e notificação
- 📝 Anotações (lista de compras, ideias…)
- 🧠 Memória: guarda fatos sobre você e usa nas próximas conversas
- 📚 Pesquisa na Wikipédia
- 🔗 Abre buscas no Google, YouTube (músicas) e Maps
- Modo conversa (volta a ouvir sozinho depois de responder)
- Palavra de ativação "Jarvis" (com o app aberto, melhor no computador)

## Como colocar no ar (uma vez só)

1. **Pegue a chave gratuita do Gemini:** entre em <https://aistudio.google.com/apikey> com sua conta Google e clique em *Create API key*.
2. **Publique no GitHub Pages:** no repositório, vá em *Settings → Pages*, em *Source* escolha *Deploy from a branch*, selecione o branch (ex.: `main`) e a pasta `/ (root)`, depois clique em *Save*.
   Em 1 ou 2 minutos o app fica em `https://SEU-USUARIO.github.io/game/jarvis/`.
3. Abra esse endereço, toque em ⚙️ e cole a chave.

> O microfone só funciona em sites com **https** (o GitHub Pages já é https). Abrir o arquivo direto do computador não libera o microfone.

## Instalar como app

- **Android (Chrome):** abra o endereço, toque nos ⋮ e depois em *Instalar app* ou *Adicionar à tela inicial*.
- **Computador (Chrome/Edge):** clique no ícone de instalar na barra de endereço (⊕).

Em cada aparelho você cola a chave uma vez. Memória, notas e lembretes ficam salvos **em cada aparelho separadamente** (a sincronização entre eles fica para uma próxima etapa).

## Limitações atuais

- Use o **Chrome** (ou Edge no PC): é o navegador que reconhece voz.
- Lembretes só tocam com o app aberto ou recém-usado. Se estiver fechado, avisa assim que você abrir.
- "Ficar ouvindo Jarvis" só funciona com o app aberto na tela. No Android, o celular apita a cada reinício da escuta, por isso é melhor usar o botão do microfone.
- A cota gratuita do Gemini tem limite de pedidos por minuto e por dia. Para uso pessoal costuma sobrar.
- Se o Google lançar um modelo novo, dá para trocar o nome do modelo em ⚙️.

## Próximas etapas possíveis

- Sincronizar memória e notas entre celular e PC
- Agente no computador, para abrir programas no PC pelo celular
- Casa inteligente (Home Assistant)
