# projektne_naloge
vse projektne naloge

repo za vse projetken naloge na enem mestu (razen RPS)

## Demo zagon

Za koncni demo je v korenu repozitorija dodan `start.sh`. Skripta zazene:

- ORV FastAPI storitev na `http://localhost:8000`,
- RAI backend na `http://localhost:5000`,
- RAI frontend na `http://localhost:3000`.

Uporaba:

```bash
./start.sh
```

Skripta ne ustvarja `.env` datotek in ne zapisuje skrivnosti. Pred zagonom mora
biti `RAI/server/.env` pripravljen lokalno, odvisnosti pa namescene v
`RAI/server`, `RAI/client` in `VID` okolju.
