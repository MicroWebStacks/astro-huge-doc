

function calculate_span(aspectRatio){
    let spanWidth = 1, spanHeight = 1
    if(aspectRatio > 1) { // Wider image
        spanWidth = Math.round(aspectRatio) // Adjust this logic as per your grid layout needs
    } else if(aspectRatio < 1) { // Taller image
        spanHeight = Math.round(1 / aspectRatio) // Adjust this logic as per your grid layout needs
    }
    return {spanWidth,spanHeight}
}

function select_masonry(imageUrls){
    const countGreaterOrEqualOne = imageUrls.filter(item => item.ratio >= 1).length;
    return countGreaterOrEqualOne > imageUrls.length / 2;
}

export {
    calculate_span,
    select_masonry
}
