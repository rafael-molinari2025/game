# Arena Rúnica

Um MOBA original para navegador, feito com HTML5 Canvas e JavaScript puro, sem dependências nem build.
Você controla um herói contra bots: avance pelas rotas com suas tropas, derrube as torres inimigas
e destrua o **Núcleo** do time vermelho.

## Como jogar

Abra o arquivo `index.html` em qualquer navegador moderno (Chrome, Edge, Firefox).
Não é preciso instalar nada nem rodar servidor.

> Requer teclado e mouse.

### Controles

| Tecla | Ação |
|---|---|
| Botão direito | Mover / atacar (no chão, em um inimigo ou no minimapa) |
| Q W E R | Habilidades (miram no cursor; R libera no nível 6) |
| D / F | Lampejo (teleporte curto) / Cura |
| A + clique esquerdo | Mover atacando o que aparecer pelo caminho |
| S | Parar |
| B | Voltar à base (4s, cancela se tomar dano) |
| P | Loja (compra só na base ou morto) |
| 1–6 | Usar item consumível (poção) |
| Tab (segurar) | Placar |
| Y / Espaço | Travar ou destravar a câmera / centralizar no herói |
| Clique esquerdo no minimapa | Mover a câmera |
| Esc | Pausar |

## Conteúdo

- **Mapa** com 3 rotas (Topo, Meio, Baixo), rio, selva e duas bases com fonte de cura.
- **Tropas** que nascem a cada 30s (corpo a corpo, à distância e de cerco a cada 3 ondas) e ficam mais fortes com o tempo.
- **Torres** em ordem de proteção (externa → interna → torres do núcleo → Núcleo). Elas priorizam
  tropas, mas atacam você se você atacar um herói inimigo perto delas.
- **4 heróis** com 4 habilidades cada:
  - **Kael**, Lâmina Solar (Lutador): cone de dano, escudo, investida e explosão que atordoa.
  - **Lyra**, Arqueira dos Ventos (Atiradora): flecha perfurante, frenesi, salto e chuva de flechas.
  - **Morvek**, Mago do Abismo (Mago): orbe explosivo, poço de lentidão, teleporte e colapso estelar.
  - **Thorn**, Colosso de Pedra (Tanque): rocha que causa lentidão, redução de dano, tremor e avalanche.
- **Níveis 1–18**, ganhando experiência ao ficar perto de tropas e heróis abatidos.
- **Ouro e loja** com 15 itens (dano, poder, vida, armadura, roubo de vida, redução de recarga...).
- **Selva** com lobos, o **Arauto de Pedra** (ouro para o time) e a **Serpe Ancestral** (+15% de dano por 2 min).
- **Névoa de guerra**: você só vê inimigos dentro da visão dos seus aliados.
- **Bots** que farmam, trocam golpes, usam habilidades, recuam com pouca vida, voltam à base e compram itens.
- Modos **1v1, 3v3 e 5v5** e dificuldades **Fácil, Normal e Difícil**.

## Estrutura do código

```
index.html      página, menus e sobreposições
style.css       estilo dos menus, loja e placar
js/util.js      funções auxiliares (matemática, aleatoriedade)
js/data.js      mapa, rotas, torres, tropas, monstros, itens e heróis/habilidades
js/game.js      simulação: unidades, combate, buffs, projéteis, ondas, recompensas
js/ai.js        inteligência artificial dos heróis bots
js/render.js    desenho do mapa, unidades, efeitos, névoa, HUD e minimapa
js/ui.js        entrada de mouse/teclado, câmera, menu, loja, placar e tela final
js/main.js      inicialização e laço principal (simulação fixa a 60 passos/s)
```

### Criando um novo herói

Adicione uma entrada em `HEROES` (`js/data.js`) com os atributos base, o crescimento por nível,
a ordem de compra dos bots (`build`) e 4 habilidades. Cada habilidade define `cd`, `cost`, `range`,
um tipo `ai` (para os bots saberem quando usá-la), `desc(h)` e `cast(h, x, y)`. Use os auxiliares
`dealDamage`, `enemiesInRadius`, `fireSkillshot`, `addZone`, `addDelayed`, `startDash`, `blink` e `addBuff`.

## Publicar no GitHub Pages

Em *Settings → Pages*, escolha a branch e a pasta raiz (`/`). O jogo ficará disponível em
`https://<usuario>.github.io/<repositorio>/`.
