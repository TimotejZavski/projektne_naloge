using System.ComponentModel.DataAnnotations;

namespace NPO_Aplikacija.Models;

public sealed class LoginFormModel
{
    [Required(ErrorMessage = "E-postni naslov je obvezen.")]
    [EmailAddress(ErrorMessage = "Vnesite veljaven e-postni naslov.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Geslo je obvezno.")]
    public string Password { get; set; } = string.Empty;
}
