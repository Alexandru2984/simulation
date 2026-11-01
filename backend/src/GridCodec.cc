#include "GridCodec.h"

#include <zlib.h>

namespace GridCodec {

std::string compressPacked(const std::vector<std::int16_t>& packed, int fields, int rows, int cols) {
    const std::size_t n = static_cast<std::size_t>(fields) * rows * cols;
    if (packed.size() != n) throw std::invalid_argument("packed size does not match the grid");

    // Row delta, then byte shuffle (see GridCodec.h).
    std::string shuffled(n * 2, '\0');
    std::size_t i = 0;
    for (int f = 0; f < fields; ++f) {
        for (int r = 0; r < rows; ++r) {
            std::uint16_t prev = 0;
            for (int c = 0; c < cols; ++c, ++i) {
                const auto value = static_cast<std::uint16_t>(packed[i]);
                const auto delta = static_cast<std::uint16_t>(value - prev);
                prev = value;
                shuffled[i] = static_cast<char>(delta & 0xFF);
                shuffled[n + i] = static_cast<char>(delta >> 8);
            }
        }
    }

    uLongf size = compressBound(static_cast<uLong>(shuffled.size()));
    std::string out(size, '\0');
    if (compress2(reinterpret_cast<Bytef*>(out.data()), &size,
                  reinterpret_cast<const Bytef*>(shuffled.data()),
                  static_cast<uLong>(shuffled.size()), 6) != Z_OK)
        throw std::runtime_error("zlib compression failed");
    out.resize(size);
    return out;
}

std::vector<std::int16_t> decompressPacked(const std::string& payload, int fields, int rows, int cols) {
    const std::size_t n = static_cast<std::size_t>(fields) * rows * cols;
    std::string shuffled(n * 2, '\0');
    uLongf size = static_cast<uLongf>(shuffled.size());
    if (uncompress(reinterpret_cast<Bytef*>(shuffled.data()), &size,
                   reinterpret_cast<const Bytef*>(payload.data()),
                   static_cast<uLong>(payload.size())) != Z_OK || size != shuffled.size())
        throw std::runtime_error("malformed compressed grid payload");

    std::vector<std::int16_t> packed(n);
    std::size_t i = 0;
    for (int f = 0; f < fields; ++f) {
        for (int r = 0; r < rows; ++r) {
            std::uint16_t prev = 0;
            for (int c = 0; c < cols; ++c, ++i) {
                const auto delta = static_cast<std::uint16_t>(
                    static_cast<unsigned char>(shuffled[i]) |
                    (static_cast<unsigned char>(shuffled[n + i]) << 8));
                prev = static_cast<std::uint16_t>(prev + delta);
                packed[i] = static_cast<std::int16_t>(prev);
            }
        }
    }
    return packed;
}

}  // namespace GridCodec
