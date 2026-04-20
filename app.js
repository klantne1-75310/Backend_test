document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://xfrmdatpjcjwfpgdtklf.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_O34fEUEcXoVfzvgjKQ5zDA_oIv1Ceyf';

    const { createClient } = window.supabase;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

    const booksGrid = document.getElementById('booksGrid');
    const searchInput = document.getElementById('searchInput');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const statusBox = document.getElementById('statusBox');
    const showMoreContainer = document.getElementById('showMoreContainer');
    const showMoreButton = document.getElementById('showMoreButton');
    const detailPanel = document.getElementById('detailPanel');
    const detailPanelContent = document.getElementById('detailPanelContent');

    const statBooks = document.getElementById('statBooks');
    const statAuthors = document.getElementById('statAuthors');
    const statGenres = document.getElementById('statGenres');
    const statPublishers = document.getElementById('statPublishers');

    const refreshDataBtn = document.getElementById('refreshDataBtn');
    const reloadTopBtn = document.getElementById('reloadTopBtn');
    const showAllBtn = document.getElementById('showAllBtn');

    let allBooks = [];
    let filteredBooks = [];
    let currentFilter = 'all';
    let currentQuery = '';
    let visibleCount = 18;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    function setStatus(message, type = '') {
        statusBox.className = `status-box ${type}`.trim();
        statusBox.textContent = message;
    }

    function getBookGradient(id) {
        const hue = (id * 47) % 360;
        return `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 55) % 360}, 70%, 35%))`;
    }

    async function safeSelect(table, columns, orderColumn = null) {
        try {
            let query = supabaseClient.from(table).select(columns);
            if (orderColumn) {
                query = query.order(orderColumn, { ascending: true });
            }
            const { data, error } = await query;
            return { data: data || [], error };
        } catch (err) {
            return { data: [], error: err };
        }
    }

    async function loadDatabase() {
        setStatus('Ładowanie danych z Supabase...');

        const [
            booksRes,
            authorsRes,
            genresRes,
            publishersRes,
            bookAuthorsRes,
            bookGenresRes,
            bookPublishersRes
        ] = await Promise.all([
            safeSelect('ksiazki', 'id, tytul, rok_wydania', 'id'),
            safeSelect('autorzy', 'id, imie, nazwisko', 'id'),
            safeSelect('gatunki', 'id, nazwa', 'id'),
            safeSelect('wydawcy', 'id, nazwa', 'id'),
            safeSelect('ksiazki_autorzy', 'ksiazka_id, autor_id'),
            safeSelect('ksiazki_gatunki', 'ksiazka_id, gatunek_id'),
            safeSelect('ksiazki_wydawcy', 'ksiazka_id, wydawca_id')
        ]);

        if (booksRes.error) {
            console.error('Błąd ładowania ksiazki:', booksRes.error);
            throw new Error(`Nie udało się pobrać tabeli "ksiazki": ${booksRes.error.message || booksRes.error}`);
        }

        const warnings = [];
        if (authorsRes.error) warnings.push('autorzy');
        if (genresRes.error) warnings.push('gatunki');
        if (publishersRes.error) warnings.push('wydawcy');
        if (bookAuthorsRes.error) warnings.push('ksiazki_autorzy');
        if (bookGenresRes.error) warnings.push('ksiazki_gatunki');
        if (bookPublishersRes.error) warnings.push('ksiazki_wydawcy');

        const books = booksRes.data;
        const authors = authorsRes.data;
        const genres = genresRes.data;
        const publishers = publishersRes.data;
        const bookAuthors = bookAuthorsRes.data;
        const bookGenres = bookGenresRes.data;
        const bookPublishers = bookPublishersRes.data;

        const authorsMap = new Map(
            authors.map(a => [a.id, `${a.imie} ${a.nazwisko}`.trim()])
        );

        const genresMap = new Map(
            genres.map(g => [g.id, g.nazwa])
        );

        const publishersMap = new Map(
            publishers.map(w => [w.id, w.nazwa])
        );

        const authorsByBook = new Map();
        const genresByBook = new Map();
        const publishersByBook = new Map();

        for (const row of bookAuthors) {
            if (!authorsByBook.has(row.ksiazka_id)) {
                authorsByBook.set(row.ksiazka_id, []);
            }
            const authorName = authorsMap.get(row.autor_id);
            if (authorName) authorsByBook.get(row.ksiazka_id).push(authorName);
        }

        for (const row of bookGenres) {
            if (!genresByBook.has(row.ksiazka_id)) {
                genresByBook.set(row.ksiazka_id, []);
            }
            const genreName = genresMap.get(row.gatunek_id);
            if (genreName) genresByBook.get(row.ksiazka_id).push(genreName);
        }

        for (const row of bookPublishers) {
            if (!publishersByBook.has(row.ksiazka_id)) {
                publishersByBook.set(row.ksiazka_id, []);
            }
            const publisherName = publishersMap.get(row.wydawca_id);
            if (publisherName) publishersByBook.get(row.ksiazka_id).push(publisherName);
        }

        allBooks = books.map(book => ({
            id: book.id,
            title: book.tytul,
            year: book.rok_wydania,
            authors: [...new Set(authorsByBook.get(book.id) || [])],
            genres: [...new Set(genresByBook.get(book.id) || [])],
            publishers: [...new Set(publishersByBook.get(book.id) || [])],
            gradient: getBookGradient(book.id)
        }));

        statBooks.textContent = books.length;
        statAuthors.textContent = authors.length;
        statGenres.textContent = genres.length;
        statPublishers.textContent = publishers.length;

        if (warnings.length) {
            setStatus(`Załadowano książki, ale nie udało się pobrać części tabel: ${warnings.join(', ')}`, 'warning');
        } else {
            setStatus(`Załadowano ${books.length} książek z bazy.`);
        }

        applyFilters();
    }

    function applyFilters() {
        visibleCount = 18;

        let result = [...allBooks];

        const query = currentQuery.trim().toLowerCase();
        if (query) {
            result = result.filter(book => {
                const haystack = [
                    book.title,
                    String(book.year ?? ''),
                    ...book.authors,
                    ...book.genres,
                    ...book.publishers
                ].join(' | ').toLowerCase();

                return haystack.includes(query);
            });
        }

        if (currentFilter === 'recent') {
            result = result.filter(book => Number(book.year) >= 2000);
        } else if (currentFilter === 'classic') {
            result = result.filter(book => Number(book.year) < 2000);
        }

        filteredBooks = result;
        renderBooks();
    }

    function renderBooks() {
        if (!filteredBooks.length) {
            booksGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    Brak książek spełniających kryteria.
                </div>
            `;
            showMoreContainer.classList.add('hidden');
            return;
        }

        const booksToShow = filteredBooks.slice(0, visibleCount);

        booksGrid.innerHTML = booksToShow.map(book => `
            <div class="book-card" data-book-id="${book.id}">
                <div class="book-cover" style="background: ${book.gradient};">
                    <div class="book-title">${escapeHtml(book.title)}</div>
                    <div class="book-author">${escapeHtml(book.authors[0] || 'Nieznany autor')}</div>
                    <div class="book-year">${escapeHtml(String(book.year ?? 'Brak roku'))}</div>
                </div>
            </div>
        `).join('');

        const cards = booksGrid.querySelectorAll('.book-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const bookId = Number(card.dataset.bookId);
                const book = allBooks.find(b => b.id === bookId);
                if (book) openDetailPanel(book);
            });
        });

        if (filteredBooks.length > visibleCount) {
            showMoreContainer.classList.remove('hidden');
        } else {
            showMoreContainer.classList.add('hidden');
        }
    }

    function openDetailPanel(book) {
        const authorsText = book.authors.length ? book.authors.join(', ') : 'Nieznany autor';
        const genresHtml = book.genres.length
            ? book.genres.map(g => `<span class="detail-tag">${escapeHtml(g)}</span>`).join('')
            : '<span class="detail-tag gray">Brak gatunku</span>';

        const publishersHtml = book.publishers.length
            ? book.publishers.map(p => `<span class="detail-tag gray">${escapeHtml(p)}</span>`).join('')
            : '<span class="detail-tag gray">Brak wydawcy</span>';

        detailPanelContent.innerHTML = `
            <button class="detail-close" id="detailCloseBtn">✕</button>

            <div class="detail-book-info">
                <div class="detail-cover" style="background: ${book.gradient};">
                    <div class="book-title">${escapeHtml(book.title)}</div>
                    <div class="book-author">${escapeHtml(book.authors[0] || 'Nieznany autor')}</div>
                    <div class="book-year">${escapeHtml(String(book.year ?? 'Brak roku'))}</div>
                </div>

                <div class="detail-info">
                    <h2>${escapeHtml(book.title)}</h2>
                    <div class="author-name">✍️ ${escapeHtml(authorsText)}</div>

                    <div class="detail-meta">
                        <div class="detail-meta-item">
                            <strong>ID:</strong>
                            <span>${book.id}</span>
                        </div>
                        <div class="detail-meta-item">
                            <strong>Rok:</strong>
                            <span>${escapeHtml(String(book.year ?? 'Brak danych'))}</span>
                        </div>
                        <div class="detail-meta-item">
                            <strong>Autorzy:</strong>
                            <span>${escapeHtml(authorsText)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="detail-description">
                <h3>Gatunki</h3>
                <div class="detail-tags">${genresHtml}</div>

                <h3 style="margin-top: 20px;">Wydawcy</h3>
                <div class="detail-tags">${publishersHtml}</div>

                <h3 style="margin-top: 24px;">Opis widoku</h3>
                <p>
                    To jest widok danych pobranych bezpośrednio z Supabase.
                    Książka <strong>${escapeHtml(book.title)}</strong> została wydana w roku
                    <strong>${escapeHtml(String(book.year ?? 'brak'))}</strong>.
                </p>
                <p>
                    Autorzy: ${escapeHtml(authorsText)}.
                    ${book.genres.length ? `Gatunki: ${escapeHtml(book.genres.join(', '))}.` : ''}
                    ${book.publishers.length ? `Wydawcy: ${escapeHtml(book.publishers.join(', '))}.` : ''}
                </p>
            </div>
        `;

        detailPanel.classList.add('active');

        document.getElementById('detailCloseBtn').addEventListener('click', closeDetailPanel);
    }

    function closeDetailPanel() {
        detailPanel.classList.remove('active');
    }

    searchInput.addEventListener('input', e => {
        currentQuery = e.target.value;
        applyFilters();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });

    showMoreButton.addEventListener('click', () => {
        visibleCount += 18;
        renderBooks();
    });

    refreshDataBtn.addEventListener('click', async () => {
        await loadDatabase();
    });

    reloadTopBtn.addEventListener('click', async () => {
        await loadDatabase();
    });

    showAllBtn.addEventListener('click', () => {
        currentQuery = '';
        searchInput.value = '';
        currentFilter = 'all';
        filterBtns.forEach(b => b.classList.remove('active'));
        document.querySelector('[data-filter="all"]').classList.add('active');
        applyFilters();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeDetailPanel();
        }
    });

    loadDatabase().catch(err => {
        console.error(err);
        setStatus(`Błąd ładowania danych: ${err.message}`, 'error');
        booksGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                Nie udało się załadować danych z Supabase.
            </div>
        `;
    });
});