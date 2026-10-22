using System.Text.Json.Serialization;

namespace LibraryManagement.Domain.Entities;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum BookCopyStatus
{
    Available,
    OnLoan,
    Missing,
    Damaged
}
