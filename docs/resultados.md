# Resultados e condições de avaliação

[Início](../README.md) · [Aplicativo](aplicativo.md) · [Método](evolucao-e-metodo.md) · [Engenharia](engenharia.md)

**Referência: entrega técnica validada em setembro de 2026.** Esta página resume registros de testes, auditoria e distribuição do projeto. Os registros completos permanecem sob guarda da equipe. Os resultados são apresentados com seu escopo; não são certificações independentes.

## Testes automatizados

| Camada avaliada | Testes aprovados |
| --- | ---: |
| Aplicativo Flutter | 368 |
| Testes unitários do backend | 126 |
| Regras de acesso | 53 |
| Integração | 43 |
| **Total da entrega** | **590** |

As contagens correspondem à execução consolidada de integração contínua da entrega. Não somam reexecuções nem representam porcentagem de cobertura. A análise estática e as verificações de compilação também foram aprovadas. A avaliação de regras e integração utilizou ambientes de teste isolados.

## Tamanho do aplicativo

| Comparação equivalente | Antes | Depois |
| --- | ---: | ---: |
| APK em modo *profile*, em bytes | 91.867.301 | 52.811.661 |
| Mesmo tamanho em MB decimais | 91,87 | 52,81 |

**Redução: 39.055.640 bytes, ou 42,51%.**

A comparação utiliza a mesma versão de ferramentas, variante de desenvolvimento, modo de compilação e conjunto de três arquiteturas Android. Os artefatos foram gerados em builds limpos. A redução não dependeu da remoção de funcionalidades ou da redução da resolução dos recursos visuais. Tamanho transferido e espaço ocupado após a instalação são medidas diferentes.

O APK posteriormente assinado e distribuído pela integração contínua tinha **52.870.548 bytes**, aproximadamente **52,87 MB**. É um artefato diferente daquele usado na comparação local.

A referência inicial de aproximadamente 170 MiB correspondia a um APK de depuração. Compará-lo diretamente ao resultado em *profile* mistura otimização e mudança de modo de compilação; por isso, essa diferença não é o percentual destacado no showcase.

## Desempenho observado

| Avaliação | Resultado e condições |
| --- | --- |
| Abertura da atividade Android | Mediana de **3.043 → 1.548 ms**. Cinco aberturas por versão, na mesma instância Android 11; inclui a passagem de depuração para *profile* |
| Etapas do catálogo | Metadados: **42 ms**; metadados e imagens: **499 ms**. Medianas de cinco amostras pareadas, com dois anúncios e duas miniaturas |
| Transferência controlada | **40 → 20 downloads; 2,5 → 1,25 MiB**. Duas visitas a uma página com vinte imagens, comparando ausência e presença de reutilização |

A abertura apresentou redução de 49,13% na mediana, **com mudança de modo de compilação**. Ela mede a abertura da atividade Android, não a disponibilidade dos dados ou a fluidez de animações.

O ensaio do catálogo foi feito por requisições no computador, com 19.872 bytes de imagens. Seus 42 e 499 ms comparam etapas da mesma carga, não versões “antes e depois” da interface. O resultado orientou a revisão da espera por imagens; não deve ser anunciado como ganho universal de velocidade.

O cenário de transferência é controlado. Catálogos, rede, aparelho e condições de uso reais podem produzir resultados diferentes. Não foi realizado um benchmark amplo de tempo de quadro ou latência em escala comercial.

<a id="validacao-funcional"></a>
## Validação funcional

| Área | Verificação e limite |
| --- | --- |
| Chat | Mensagem recebida na conversa aberta passa a lida sem reentrada; contagem preservada em segundo plano e tela apagada até o retorno. Execução controlada em Development, complementada por testes automatizados |
| Notificações | Avisos reais em primeiro plano, segundo plano, tela apagada e processo encerrado, com navegação pelo toque. Verificados no Android 11; encerrar o processo não equivale a “forçar parada” |
| Planos e interface | 24 combinações de quatro larguras, três escalas de texto e dois temas. Não equivale a auditoria completa de acessibilidade |
| Jornada básica | Início, busca, imagens, detalhes e planos no aplicativo assinado, em ambiente de desenvolvimento |
| Entrega | Geração, assinatura, verificação e distribuição automatizada em canal restrito de testes |

Os testes automatizados também cobrem estados de navegação, concorrência, falhas transitórias e situações de acesso negado. Não são publicados os cenários internos ou sua implementação.

## O que ainda precisa de avaliação

- Notificações em Android 13 e posteriores e em fabricantes com restrições específicas.
- Desempenho em mais aparelhos, redes e volumes de dados.
- Usabilidade do aplicativo atual com registros de pesquisa completos.
- Impacto ambiental, adoção e resultados econômicos em operação real.

O projeto não apresenta pagamentos reais, uma entrega iOS ou conformidade integral certificada como resultados desta etapa.
