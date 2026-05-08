using System.ComponentModel.DataAnnotations;

namespace NPO_Aplikacija.Models;

public sealed class RegistrationFormModel
{
    [Required(ErrorMessage = "Ime je obvezno.")]
    [StringLength(60, MinimumLength = 2, ErrorMessage = "Ime mora imeti med 2 in 60 znaki.")]
    public string DisplayName { get; set; } = string.Empty;

    [Required(ErrorMessage = "E-postni naslov je obvezen.")]
    [EmailAddress(ErrorMessage = "Vnesite veljaven e-postni naslov.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Geslo je obvezno.")]
    [StringLength(100, MinimumLength = 8, ErrorMessage = "Geslo mora imeti vsaj 8 znakov.")]
    [RegularExpression(
        @"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$",
        ErrorMessage = "Geslo mora vsebovati malo crko, veliko crko in stevilko.")]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Potrditev gesla je obvezna.")]
    [Compare(nameof(Password), ErrorMessage = "Gesli se ne ujemata.")]
    public string ConfirmPassword { get; set; } = string.Empty;

    [Range(typeof(bool), "true", "true", ErrorMessage = "Za registracijo morate sprejeti pogoje.")]
    public bool AcceptTerms { get; set; }
}
