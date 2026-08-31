from academia_espronceda_solver.observability import redact_text, redact_value


def test_redacts_bearer_tokens_and_secret_fields() -> None:
    assert redact_text("Authorization Bearer super-secret") == "Authorization Bearer [REDACTED]"
    assert (
        redact_text("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature")
        == "token [REDACTED]"
    )
    redacted = redact_value(
        {
            "requestId": "corr-1",
            "Authorization": "Bearer abc",
            "password": "never",
            "status": 401,
        }
    )
    assert redacted == {
        "requestId": "corr-1",
        "Authorization": "[REDACTED]",
        "password": "[REDACTED]",
        "status": 401,
    }
