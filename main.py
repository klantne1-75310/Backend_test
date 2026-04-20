import os
from typing import List, Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# Załaduj zmienne środowiskowe lokalnie (Render dostarczy je bezpośrednio)
load_dotenv()

app = FastAPI(title="Biblioteka API", description="Backend dla aplikacji bibliotecznej", version="1.0.0")

# Konfiguracja CORS – ZMIEŃ NA SWÓJ ADRES GITHUB PAGES!
origins = [
    "http://localhost:5500",      # dla lokalnego testowania (Live Server)
    "http://127.0.0.1:5500",
    "https://TWOJA-NAZWA-UZYTKOWNIKA.github.io",  # 👈 ZMIEŃ NA SWÓJ!
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Supabase – klucz serwisowy (tajny, nie umieszczaj go w frontendzie!)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("Brak zmiennych środowiskowych SUPABASE_URL lub SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ------------------- Modele Pydantic -------------------
class BookResponse(BaseModel):
    id: int
    title: str
    year: Optional[int]
    authors: List[str]
    genres: List[str]
    publishers: List[str]


class BooksResponse(BaseModel):
    stats: dict
    books: List[BookResponse]


# ------------------- Endpoint -------------------
@app.get("/api/books", response_model=BooksResponse)
async def get_books(
    q: Optional[str] = Query(None, description="Fraza wyszukiwania (tytuł, autor, gatunek, wydawca)"),
    filter: Optional[str] = Query("all", description="Filtr: all, recent (>=2000), classic (<2000)")
):
    # Pobranie wszystkich potrzebnych danych w jednym zapytaniu z zagnieżdżonymi relacjami
    # Supabase pozwala na zagnieżdżone select przez nazwy relacji (utworzone z kluczy obcych)
    query = supabase.table("ksiazki").select(
        "id, tytul, rok_wydania, "
        "ksiazki_autorzy(autor_id(imie, nazwisko)), "
        "ksiazki_gatunki(gatunek_id(nazwa)), "
        "ksiazki_wydawcy(wydawca_id(nazwa))"
    )

    # Wykonaj zapytanie
    response = query.execute()
    books_data = response.data

    # Pobranie statystyk
    stats = {}
    try:
        stats["books"] = supabase.table("ksiazki").select("*", count="exact").execute().count
        stats["authors"] = supabase.table("autorzy").select("*", count="exact").execute().count
        stats["genres"] = supabase.table("gatunki").select("*", count="exact").execute().count
        stats["publishers"] = supabase.table("wydawcy").select("*", count="exact").execute().count
    except:
        # Fallback – policz z pobranych danych (mniej dokładne, ale lepsze niż nic)
        stats["books"] = len(books_data)
        stats["authors"] = 0
        stats["genres"] = 0
        stats["publishers"] = 0

    # Przetwarzanie książek
    books = []
    for book in books_data:
        # Autorzy
        authors = []
        for rel in book.get("ksiazki_autorzy", []):
            if rel.get("autor_id"):
                a = rel["autor_id"]
                authors.append(f"{a['imie']} {a['nazwisko']}".strip())

        # Gatunki
        genres = []
        for rel in book.get("ksiazki_gatunki", []):
            if rel.get("gatunek_id"):
                genres.append(rel["gatunek_id"]["nazwa"])

        # Wydawcy
        publishers = []
        for rel in book.get("ksiazki_wydawcy", []):
            if rel.get("wydawca_id"):
                publishers.append(rel["wydawca_id"]["nazwa"])

        book_obj = BookResponse(
            id=book["id"],
            title=book["tytul"],
            year=book.get("rok_wydania"),
            authors=authors,
            genres=genres,
            publishers=publishers
        )
        books.append(book_obj)

    # Filtrowanie po stronie serwera – wyszukiwanie tekstowe
    if q:
        q_lower = q.lower()
        filtered_books = []
        for b in books:
            haystack = " | ".join([
                b.title,
                str(b.year or ""),
                *b.authors,
                *b.genres,
                *b.publishers
            ]).lower()
            if q_lower in haystack:
                filtered_books.append(b)
        books = filtered_books

    # Filtrowanie po roku
    if filter == "recent":
        books = [b for b in books if b.year and b.year >= 2000]
    elif filter == "classic":
        books = [b for b in books if b.year and b.year < 2000]

    return BooksResponse(stats=stats, books=books)


# Endpoint testowy – sprawdzenie, czy API działa
@app.get("/")
async def root():
    return {"message": "Biblioteka API działa! Przejdź do /docs aby zobaczyć dokumentację."}