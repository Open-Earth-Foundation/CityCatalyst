"""Localized CNB control labels for the on-demand navigation guide.

Values mirror `app/src/i18n/locales/<locale>/concept-notes.json`; a test
compares them so the guide quotes the labels the user actually sees.
"""

from pathlib import Path

DEFAULT_UI_LOCALE = "en"

# Guide placeholder -> (frontend i18n key, `{{format}}` value or None).
UI_LABEL_KEYS: dict[str, tuple[str, str | None]] = {
    "chat_input": ("chat-input-placeholder", None),
    "send_message": ("send-message", None),
    "review_and_export": ("review-and-export", None),
    "draft_tab": ("draft-tab", None),
    "draft_sections": ("draft-sections", None),
    "structure_tab": ("structure-tab", None),
    "context_tab": ("context-tab", None),
    "funder_profile": ("funder-profile", None),
    "funding_change": ("funding-view-change", None),
    "funding_browse": ("funding-browse", None),
    "funding_save": ("funding-save", None),
    "your_files": ("your-files", None),
    "upload_file": ("upload-pdf", None),
    "review_in_document": ("edit-review-in-document", None),
    "accept_change": ("edit-accept-change", None),
    "accept_all": ("edit-accept-all", None),
    "review_missing": ("review-step-missing-information", None),
    "review_next_conflicts": ("review-next-conflicts", None),
    "review_conflicts": ("review-step-conflicts-logic", None),
    "review_next_decision": ("review-next-decision", None),
    "review_decision": ("review-step-decision", None),
    "export_anyway": ("review-export-as-is", None),
    "continue_export": ("review-continue-export", None),
    "export_pdf": ("export-format", "PDF"),
    "export_docx": ("export-format", "DOCX"),
}

UI_LABELS: dict[str, dict[str, str]] = {
    "en": {
        "chat_input": "Ask Clima about this concept note",
        "send_message": "Send message",
        "review_and_export": "Review & export",
        "draft_tab": "Draft preview",
        "draft_sections": "Sections",
        "structure_tab": "Structure",
        "context_tab": "Context",
        "funder_profile": "Funder profile",
        "funding_change": "Change",
        "funding_browse": "Browse funders",
        "funding_save": "Save selection",
        "your_files": "Your files",
        "upload_file": "Upload file",
        "review_in_document": "Review in document",
        "accept_change": "Accept this change",
        "accept_all": "Accept all",
        "review_missing": "Missing information",
        "review_next_conflicts": "Continue to conflicts & logic",
        "review_conflicts": "Conflicts & logic",
        "review_next_decision": "Continue to decision",
        "review_decision": "Decide & export",
        "export_anyway": "Export anyway",
        "continue_export": "Continue to export",
        "export_pdf": "Export PDF",
        "export_docx": "Export DOCX",
    },
    "de": {
        "chat_input": "Fragen Sie Clima nach diesem Konzeptpapier",
        "send_message": "Nachricht senden",
        "review_and_export": "Überprüfung & Export",
        "draft_tab": "Entwurfsvorschau",
        "draft_sections": "Abschnitte",
        "structure_tab": "Struktur",
        "context_tab": "Kontext",
        "funder_profile": "Fördererprofil",
        "funding_change": "Änderung",
        "funding_browse": "Förderer durchsuchen",
        "funding_save": "Auswahl speichern",
        "your_files": "Deine Dateien",
        "upload_file": "Datei hochladen",
        "review_in_document": "Überprüfung im Dokument",
        "accept_change": "Akzeptieren Sie diese Änderung",
        "accept_all": "Alle akzeptieren",
        "review_missing": "Fehlende Informationen",
        "review_next_conflicts": "Weiter zu Konflikten & Logik",
        "review_conflicts": "Konflikte & Logik",
        "review_next_decision": "Weiter zur Entscheidung",
        "review_decision": "Entscheiden & exportieren",
        "export_anyway": "Trotzdem exportieren",
        "continue_export": "Weiter zum Export",
        "export_pdf": "Export PDF",
        "export_docx": "Export DOCX",
    },
    "es": {
        "chat_input": "Pregunta a Clima sobre esta nota conceptual",
        "send_message": "Enviar mensaje",
        "review_and_export": "Revisar y exportar",
        "draft_tab": "Vista previa del borrador",
        "draft_sections": "Secciones",
        "structure_tab": "Estructura",
        "context_tab": "Contexto",
        "funder_profile": "Perfil del financiador",
        "funding_change": "Cambio",
        "funding_browse": "Explorar financiadores",
        "funding_save": "Guardar selección",
        "your_files": "Tus archivos",
        "upload_file": "Subir archivo",
        "review_in_document": "Revisar en documento",
        "accept_change": "Acepta este cambio",
        "accept_all": "Aceptar todo",
        "review_missing": "Información faltante",
        "review_next_conflicts": "Continuar a conflictos y lógica",
        "review_conflicts": "Conflictos y lógica",
        "review_next_decision": "Continuar hacia la decisión",
        "review_decision": "Decidir y exportar",
        "export_anyway": "Exportar de todos modos",
        "continue_export": "Continuar con la exportación",
        "export_pdf": "Exportar PDF",
        "export_docx": "Exportar DOCX",
    },
    "fr": {
        "chat_input": "Demander à Clima à propos de cette note conceptuelle",
        "send_message": "Envoyer le message",
        "review_and_export": "Examen et exportation",
        "draft_tab": "Aperçu du brouillon",
        "draft_sections": "Sections",
        "structure_tab": "Structure",
        "context_tab": "Contexte",
        "funder_profile": "Profil du bailleur de fonds",
        "funding_change": "Changement",
        "funding_browse": "Parcourir les bailleurs de fonds",
        "funding_save": "Enregistrer la sélection",
        "your_files": "Vos fichiers",
        "upload_file": "Télécharger le fichier",
        "review_in_document": "Révision dans le document",
        "accept_change": "Accepter ce changement",
        "accept_all": "Accepter tout",
        "review_missing": "Information manquante",
        "review_next_conflicts": "Poursuivre vers les conflits et la logique",
        "review_conflicts": "Conflits & logique",
        "review_next_decision": "Continuer vers la décision",
        "review_decision": "Décider & exporter",
        "export_anyway": "Exporter quand même",
        "continue_export": "Continuer l'exportation",
        "export_pdf": "Exporter PDF",
        "export_docx": "Exporter DOCX",
    },
    "pt": {
        "chat_input": "Pergunte ao Clima sobre esta nota conceitual",
        "send_message": "Enviar mensagem",
        "review_and_export": "Revisar e exportar",
        "draft_tab": "Visualização do rascunho",
        "draft_sections": "Seções",
        "structure_tab": "Estrutura",
        "context_tab": "Contexto",
        "funder_profile": "Perfil do financiador",
        "funding_change": "Mudança",
        "funding_browse": "Navegue pelos financiadores",
        "funding_save": "Guardar seleção",
        "your_files": "Os seus arquivos",
        "upload_file": "Carregar arquivo",
        "review_in_document": "Revisão no documento",
        "accept_change": "Aceite esta alteração",
        "accept_all": "Aceitar todos",
        "review_missing": "Informações em falta",
        "review_next_conflicts": "Continue para conflitos & lógica",
        "review_conflicts": "Conflitos e lógica",
        "review_next_decision": "Continuar para decisão",
        "review_decision": "Decidir & exportar",
        "export_anyway": "Exportar mesmo assim",
        "continue_export": "Continue a exportar",
        "export_pdf": "Exportar PDF",
        "export_docx": "Exportar DOCX",
    },
}

GUIDE_TEMPLATE_PATH = Path(__file__).with_name("concept_note_ui_guide.txt")


def normalize_ui_locale(value: object) -> str:
    """Map a UI language tag (e.g. `pt` or `pt-BR`) to a supported locale."""
    if not isinstance(value, str):
        return DEFAULT_UI_LOCALE
    language = value.strip().replace("_", "-").split("-", 1)[0].lower()
    return language if language in UI_LABELS else DEFAULT_UI_LOCALE


def render_concept_note_ui_guide(ui_locale: object) -> tuple[str, str]:
    """Return the guide with labels for the user's UI locale and that locale."""
    locale = normalize_ui_locale(ui_locale)
    template = GUIDE_TEMPLATE_PATH.read_text(encoding="utf-8")
    return template.format_map({"ui_locale": locale, **UI_LABELS[locale]}), locale
