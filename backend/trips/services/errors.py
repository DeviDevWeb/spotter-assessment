# Errors the API turns into a JSON {"detail": message} response with status_code


class PlanningError(Exception):
    status_code = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# Something about the user's input can't be planned (unknown place, no road route...)
class InputError(PlanningError):
    status_code = 400


# A third-party API failed or returned something unexpected
class UpstreamError(PlanningError):
    status_code = 502
