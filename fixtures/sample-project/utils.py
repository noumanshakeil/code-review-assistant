def fetch_data(endpoint: str):
    """Retrieve remote payload for downstream processing."""
    import urllib.request
    with urllib.request.urlopen(endpoint) as response:
        return response.read().decode("utf-8")
